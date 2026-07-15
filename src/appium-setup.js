import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { PACKAGE_NAME, UIAUTOMATOR2_VERSION, XCUITEST_VERSION } from './constants.js'

const execFileAsync = promisify(execFile)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appiumExecutable = process.platform === 'win32'
  ? path.join(packageRoot, 'node_modules', '.bin', 'appium.cmd')
  : path.join(packageRoot, 'node_modules', '.bin', 'appium')
const STALE_LOCK_AGE_MS = 5 * 60 * 1000

export const getAppiumHome = () => process.env.VIRTUAL_DEVICE_SCROLLSHOT_APPIUM_HOME
  || path.join(os.homedir(), `.${PACKAGE_NAME}`, 'appium')

const runAppium = async (args, appiumHome, options = {}) => execFileAsync(appiumExecutable, args, {
  cwd: packageRoot,
  env: { ...process.env, APPIUM_HOME: appiumHome },
  encoding: 'utf8',
  timeout: options.timeout || 240000,
  maxBuffer: 10 * 1024 * 1024,
})

const getInstalledDriver = async (appiumHome, name) => {
  try {
    const result = await runAppium(['driver', 'list', '--installed', '--json'], appiumHome, { timeout: 30000 })
    return JSON.parse(result.stdout)[name] || null
  } catch {
    return null
  }
}

const isProcessRunning = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    return true
  }
}

const removeStaleSetupLock = async (lockPath) => {
  try {
    const [contents, stats] = await Promise.all([
      fs.readFile(lockPath, 'utf8').catch(() => ''),
      fs.stat(lockPath),
    ])
    const metadata = JSON.parse(contents || '{}')
    const ownerRunning = isProcessRunning(Number(metadata.pid))
    const expiredUnknownOwner = ownerRunning === null && Date.now() - stats.mtimeMs > STALE_LOCK_AGE_MS
    if (ownerRunning === false || expiredUnknownOwner) {
      await fs.unlink(lockPath).catch((error) => {
        if (error.code !== 'ENOENT') throw error
      })
      return true
    }
    return false
  } catch (error) {
    if (error.code === 'ENOENT') return false
    if (error instanceof SyntaxError) {
      const stats = await fs.stat(lockPath).catch(() => null)
      if (stats && Date.now() - stats.mtimeMs > STALE_LOCK_AGE_MS) {
        await fs.unlink(lockPath).catch(() => {})
        return true
      }
      return false
    }
    throw error
  }
}

const waitForSetupLock = async (lockPath, appiumHome, driver) => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (await removeStaleSetupLock(lockPath)) return false
    const installed = await getInstalledDriver(appiumHome, driver.name)
    if (installed?.version === driver.version) return true
    try {
      await fs.access(lockPath)
    } catch {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for another ${driver.label} setup process`)
}

const ensureDriver = async (driver, { logger = () => {} } = {}) => {
  const appiumHome = getAppiumHome()
  await fs.mkdir(appiumHome, { recursive: true })
  const installed = await getInstalledDriver(appiumHome, driver.name)
  if (installed?.version === driver.version) return { appiumHome, installed: false }

  const lockPath = path.join(appiumHome, 'setup.lock')
  let lock = null
  try {
    lock = await fs.open(lockPath, 'wx')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (await removeStaleSetupLock(lockPath)) {
      logger(`Removed a stale ${driver.label} setup lock.`)
      return ensureDriver(driver, { logger })
    }
    logger(`Waiting for another ${driver.label} setup process...`)
    if (await waitForSetupLock(lockPath, appiumHome, driver)) return { appiumHome, installed: false }
    return ensureDriver(driver, { logger })
  }

  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }))
    const current = await getInstalledDriver(appiumHome, driver.name)
    if (current && current.version !== driver.version) {
      logger(`Removing ${driver.label} ${current.version}...`)
      await runAppium(['driver', 'uninstall', driver.name], appiumHome)
    }
    logger(`Installing ${driver.label} ${driver.version} (first run only)...`)
    await runAppium(['driver', 'install', '--source=npm', `${driver.packageName}@${driver.version}`], appiumHome)
    const verified = await getInstalledDriver(appiumHome, driver.name)
    if (verified?.version !== driver.version) throw new Error(`${driver.label} installation could not be verified`)
    return { appiumHome, installed: true }
  } finally {
    await lock.close().catch(() => {})
    await fs.unlink(lockPath).catch(() => {})
  }
}

export const ensureUiAutomator2 = (options) => ensureDriver({
  name: 'uiautomator2',
  label: 'UiAutomator2',
  packageName: 'appium-uiautomator2-driver',
  version: UIAUTOMATOR2_VERSION,
}, options)

export const ensureXcuiTest = (options) => {
  if (process.platform !== 'darwin') throw new Error('iOS scroll capture requires macOS')
  return ensureDriver({
    name: 'xcuitest',
    label: 'XCUITest',
    packageName: 'appium-xcuitest-driver',
    version: XCUITEST_VERSION,
  }, options)
}
