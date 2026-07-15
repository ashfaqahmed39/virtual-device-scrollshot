import sharp from 'sharp'
import { getForegroundApp, listDevices, resolveAdbPath, resolveAndroidSdkRoot } from './adb.js'
import { createAppiumClient } from './appium-client.js'
import { startAppium } from './appium-runtime.js'
import { ensureUiAutomator2 } from './appium-setup.js'
import { DEFAULT_MAX_FRAMES, DEFAULT_MAX_HEIGHT, DEFAULT_SCROLL_PERCENT } from './constants.js'
import { selectDevice } from './device-selection.js'
import { stitchFrames } from './image-stitcher.js'

let captureQueue = Promise.resolve()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

const getElementId = (element) => element.elementId || element['element-6066-11e4-a52e-4f735466cecf']

const findScrollableElement = async (client) => {
  const elements = await client.findScrollableElements()
  const candidates = []
  for (const element of elements) {
    const elementId = getElementId(element)
    if (!elementId) continue
    try {
      const rect = await client.getElementRect(elementId)
      if (rect.width >= 100 && rect.height >= 200) {
        candidates.push({ elementId, rect, area: rect.width * rect.height })
      }
    } catch {
      // Ignore stale accessibility nodes.
    }
  }
  candidates.sort((a, b) => b.area - a.area)
  if (!candidates.length) {
    throw new Error(`No visible scrollable Android content was found (${elements.length} node(s))`)
  }
  return candidates[0]
}

const excludeNavigationBar = (rect, windowDump) => {
  const navigation = windowDump.match(/type=navigationBars frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\] visible=true/)
  if (!navigation) return rect
  const navigationTop = Number(navigation[2])
  const rectBottom = rect.y + rect.height
  if (!Number.isFinite(navigationTop) || navigationTop <= rect.y || rectBottom <= navigationTop) return rect
  return { ...rect, height: navigationTop - rect.y }
}

const gesture = (client, elementId, direction, percent) => client.scrollGesture({
  elementId,
  direction,
  percent: direction === 'up' ? 0.9 : percent,
  speed: direction === 'up' ? 1500 : 1200,
})

const scrollToTop = async (client, elementId, maxFrames) => {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const canContinue = Boolean(await gesture(client, elementId, 'up', 0.9))
    await sleep(300)
    if (!canContinue) return
  }
  throw new Error('Could not reach the top of the Android scrollable content')
}

const captureFrame = async (client) => Buffer.from(await client.takeScreenshot(), 'base64')

const runCapture = async (input = {}) => {
  const options = {
    deviceId: input.deviceId || '',
    maxFrames: input.maxFrames ?? DEFAULT_MAX_FRAMES,
    maxHeight: input.maxHeight ?? DEFAULT_MAX_HEIGHT,
    scrollPercent: input.scrollPercent ?? DEFAULT_SCROLL_PERCENT,
    verbose: Boolean(input.verbose),
    logger: input.logger || (() => {}),
  }
  validateOptions(options)

  const devices = await listDevices()
  const device = selectDevice(devices, options.deviceId)
  const adbPath = await resolveAdbPath()
  const foreground = await getForegroundApp(adbPath, device.id)
  const setup = await ensureUiAutomator2({ logger: options.logger })
  const runtime = await startAppium({
    appiumHome: setup.appiumHome,
    androidSdkRoot: resolveAndroidSdkRoot(adbPath),
    verbose: options.verbose,
  })
  let client = null

  try {
    options.logger(`Attaching to ${foreground.packageName} on ${device.id}...`)
    client = await createAppiumClient(runtime.url, {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:udid': device.id,
      'appium:appPackage': foreground.packageName,
      'appium:appActivity': foreground.activityName,
      'appium:noReset': true,
      'appium:dontStopAppOnReset': true,
      'appium:forceAppLaunch': false,
      'appium:autoLaunch': false,
      'appium:newCommandTimeout': 180,
    })

    const activePackage = await client.getCurrentPackage()
    if (activePackage !== foreground.packageName) {
      throw new Error(`Foreground app changed from ${foreground.packageName} to ${activePackage}`)
    }

    const scrollable = await findScrollableElement(client)
    options.logger('Scrolling to the top...')
    await scrollToTop(client, scrollable.elementId, options.maxFrames)
    await sleep(400)

    const frames = [await captureFrame(client)]
    let reachedBottom = false
    while (frames.length < options.maxFrames) {
      const canContinue = Boolean(await gesture(client, scrollable.elementId, 'down', options.scrollPercent))
      await sleep(450)
      frames.push(await captureFrame(client))
      options.logger(`Captured frame ${frames.length}`)
      if (!canContinue) {
        reachedBottom = true
        break
      }
    }
    if (!reachedBottom) throw new Error(`Capture exceeded the ${options.maxFrames}-frame limit`)

    const scrollRect = excludeNavigationBar(scrollable.rect, foreground.windowDump)
    const buffer = await stitchFrames(frames, scrollRect, { maxHeight: options.maxHeight })
    const metadata = await sharp(buffer).metadata()
    return {
      buffer,
      width: metadata.width,
      height: metadata.height,
      frameCount: frames.length,
      deviceId: device.id,
      packageName: foreground.packageName,
    }
  } finally {
    if (client) await client.deleteSession().catch(() => {})
    await runtime.stop()
  }
}

export const captureFullPage = (options) => {
  const capture = captureQueue.then(() => runCapture(options))
  captureQueue = capture.catch(() => {})
  return capture
}
