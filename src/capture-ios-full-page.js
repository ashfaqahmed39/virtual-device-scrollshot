import sharp from 'sharp'
import { createAppiumClient } from './appium-client.js'
import { startAppium } from './appium-runtime.js'
import { ensureXcuiTest } from './appium-setup.js'
import { DEFAULT_IOS_SCROLL_PERCENT, DEFAULT_MAX_FRAMES, DEFAULT_MAX_HEIGHT } from './constants.js'
import { areIosFramesEquivalent, scaleIosScrollRect, stitchIosFrames } from './ios-image-stitcher.js'
import { getIosPlatformVersion, listIosSimulators, selectIosSimulator } from './ios-simulators.js'

const SCROLLABLE_XPATH = '//*[self::XCUIElementTypeScrollView or self::XCUIElementTypeTable or self::XCUIElementTypeCollectionView or self::XCUIElementTypeWebView]'
const FIXED_CHROME_XPATH = '//*[self::XCUIElementTypeNavigationBar or self::XCUIElementTypeToolbar or self::XCUIElementTypeTabBar or self::XCUIElementTypeStatusBar]'
const ANCHOR_TYPES = new Set(['StaticText', 'Button', 'Image', 'Link'])
let captureQueue = Promise.resolve()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const getElementId = (element) => element.elementId || element['element-6066-11e4-a52e-4f735466cecf']

const validateOptions = (options) => {
  if (!Number.isInteger(options.maxFrames) || options.maxFrames < 2 || options.maxFrames > 50) {
    throw new Error('maxFrames must be an integer between 2 and 50')
  }
  if (!Number.isInteger(options.maxHeight) || options.maxHeight < 1000 || options.maxHeight > 100000) {
    throw new Error('maxHeight must be an integer between 1000 and 100000')
  }
  if (!Number.isFinite(options.scrollPercent) || options.scrollPercent < 0.1 || options.scrollPercent > 0.95) {
    throw new Error('scrollPercent must be between 0.1 and 0.95')
  }
}

const findScrollableElement = async (client) => {
  const elements = await client.findElements('xpath', SCROLLABLE_XPATH)
  const candidates = []
  for (const element of elements) {
    const elementId = getElementId(element)
    if (!elementId) continue
    try {
      const rect = await client.getElementRect(elementId)
      if (rect.width >= 100 && rect.height >= 200) candidates.push({ elementId, rect, area: rect.width * rect.height })
    } catch {
      // Ignore stale accessibility nodes.
    }
  }
  candidates.sort((a, b) => b.area - a.area)
  if (!candidates.length) throw new Error(`No visible scrollable iOS content was found (${elements.length} node(s))`)
  return candidates[0]
}

const getNodeRect = (node) => {
  const rect = node?.rect || {}
  return {
    x: Number(rect.x ?? rect.origin?.x),
    y: Number(rect.y ?? rect.origin?.y),
    width: Number(rect.width ?? rect.size?.width),
    height: Number(rect.height ?? rect.size?.height),
  }
}

const getAccessibilityAnchors = async (client, contentRect) => {
  try {
    const source = await client.getSourceTree()
    const root = typeof source === 'string' ? JSON.parse(source) : source
    const anchors = []
    const visit = (node) => {
      if (!node || typeof node !== 'object') return
      const rect = getNodeRect(node)
      const identity = node.rawIdentifier || node.name || node.label || node.value
      const centerX = rect.x + rect.width / 2
      const centerY = rect.y + rect.height / 2
      const visible = String(node.isVisible ?? '1') !== '0'
      const inside = centerX >= contentRect.x && centerX <= contentRect.x + contentRect.width
        && centerY >= contentRect.y && centerY <= contentRect.y + contentRect.height
      if (identity != null && ANCHOR_TYPES.has(node.type) && visible && inside && rect.width > 0 && rect.height > 0) {
        anchors.push({ key: [node.type || '', String(identity)].join('\u0000'), y: rect.y, height: rect.height })
      }
      for (const child of node.children || []) visit(child)
    }
    visit(root)
    return anchors
  } catch {
    return []
  }
}

const captureFrame = async (client, contentRect) => {
  const anchors = await getAccessibilityAnchors(client, contentRect)
  await sleep(300)
  return { image: Buffer.from(await client.takeScreenshot(), 'base64'), anchors }
}

const getFixedChromeRects = async (client) => {
  const elements = await client.findElements('xpath', FIXED_CHROME_XPATH)
  const rects = []
  for (const element of elements) {
    const elementId = getElementId(element)
    if (!elementId) continue
    try {
      rects.push(await client.getElementRect(elementId))
    } catch {
      // Ignore stale accessibility nodes.
    }
  }
  return rects
}

const scrollToTop = async (client, elementId, initialFrame, scrollRect, options) => {
  let previousFrame = initialFrame
  for (let attempt = 0; attempt < options.maxFrames; attempt += 1) {
    await client.scrollIos(elementId, 'up', options.scrollPercent)
    await sleep(800)
    const currentFrame = await captureFrame(client, scrollRect.sourceRect)
    if (await areIosFramesEquivalent(previousFrame.image, currentFrame.image, scrollRect)) return currentFrame
    previousFrame = currentFrame
  }
  throw new Error(`iOS scroll capture could not reach the top within ${options.maxFrames} frames`)
}

const normalizeIosCaptureError = (error) => {
  const message = String(error?.message || error)
  if (/Could not find a driver|automationName.*XCUITest|not installed/i.test(message)) {
    return new Error('Appium XCUITest is not installed and could not be loaded. Run the capture again with internet access.')
  }
  if (/Unable to start WebDriverAgent|ECONNREFUSED\s+127\.0\.0\.1:8100|xcodebuild.*(?:failed|code\s*70)|Unable to find a destination matching/i.test(message)) {
    return new Error('WebDriverAgent could not start. Confirm Xcode and the selected simulator runtime are installed and compatible.')
  }
  return error
}

const runCapture = async (input = {}) => {
  if (process.platform !== 'darwin') throw new Error('iOS scroll capture requires macOS')
  const options = {
    deviceId: input.deviceId || '',
    maxFrames: input.maxFrames ?? DEFAULT_MAX_FRAMES,
    maxHeight: input.maxHeight ?? DEFAULT_MAX_HEIGHT,
    scrollPercent: input.scrollPercent ?? DEFAULT_IOS_SCROLL_PERCENT,
    verbose: Boolean(input.verbose),
    logger: input.logger || (() => {}),
  }
  validateOptions(options)
  const simulator = selectIosSimulator(await listIosSimulators(), options.deviceId)
  const platformVersion = await getIosPlatformVersion(simulator.id)
  const setup = await ensureXcuiTest({ logger: options.logger })
  const runtime = await startAppium({ appiumHome: setup.appiumHome, verbose: options.verbose })
  let client = null
  try {
    options.logger(`Attaching to the foreground app on ${simulator.name}...`)
    client = await createAppiumClient(runtime.url, {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': simulator.id,
      'appium:platformVersion': platformVersion,
      'appium:autoLaunch': false,
      'appium:noReset': true,
      'appium:forceAppLaunch': false,
      'appium:shouldTerminateApp': false,
      'appium:useNewWDA': false,
      'appium:newCommandTimeout': 300,
      'appium:wdaLaunchTimeout': 180000,
      'appium:wdaStartupRetries': 1,
      'appium:screenshotQuality': 0,
      'appium:disableAutomaticScreenshots': true,
      'appium:skipLogCapture': true,
      'appium:forceSimulatorSoftwareKeyboardPresence': false,
      'appium:useNativeCachingStrategy': false,
    })
    const activeApp = await client.getActiveAppInfo()
    if (!activeApp?.bundleId || activeApp.bundleId === 'com.apple.springboard') {
      throw new Error('Open the target app on the selected iOS simulator before capturing')
    }
    const scrollable = await findScrollableElement(client)
    const windowRect = await client.getWindowRect()
    const initialImage = Buffer.from(await client.takeScreenshot(), 'base64')
    const scrollRect = await scaleIosScrollRect(initialImage, scrollable.rect, windowRect, await getFixedChromeRects(client))
    const initialFrame = { image: initialImage, anchors: await getAccessibilityAnchors(client, scrollRect.sourceRect) }
    options.logger('Scrolling to the top...')
    const topFrame = await scrollToTop(client, scrollable.elementId, initialFrame, scrollRect, options)
    const frames = [topFrame]
    let reachedBottom = false
    while (frames.length < options.maxFrames) {
      await client.scrollIos(scrollable.elementId, 'down', options.scrollPercent)
      await sleep(800)
      const currentFrame = await captureFrame(client, scrollRect.sourceRect)
      if (await areIosFramesEquivalent(frames.at(-1).image, currentFrame.image, scrollRect)) {
        reachedBottom = true
        break
      }
      frames.push(currentFrame)
      options.logger(`Captured frame ${frames.length}`)
    }
    if (!reachedBottom) throw new Error(`iOS scroll capture exceeded the ${options.maxFrames}-frame limit`)
    const buffer = await stitchIosFrames(frames, scrollRect, { maxHeight: options.maxHeight })
    const metadata = await sharp(buffer).metadata()
    return {
      buffer,
      width: metadata.width,
      height: metadata.height,
      frameCount: frames.length,
      deviceId: simulator.id,
      platformVersion,
      bundleId: activeApp.bundleId,
    }
  } catch (error) {
    throw normalizeIosCaptureError(error)
  } finally {
    if (client) await client.deleteSession().catch(() => {})
    await runtime.stop()
  }
}

export const captureIosFullPage = (options) => {
  const capture = captureQueue.then(() => runCapture(options))
  captureQueue = capture.catch(() => {})
  return capture
}
