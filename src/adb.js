import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const adbCandidates = () => {
  const executable = process.platform === 'win32' ? 'adb.exe' : 'adb'
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
    '/opt/android-sdk',
  ].filter(Boolean)

  return Array.from(new Set([
    process.env.ADB_PATH,
    'adb',
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
    ...roots.map((root) => path.join(root, 'platform-tools', executable)),
  ].filter(Boolean)))
}

export const resolveAdbPath = async () => {
  let lastError = ''
  for (const candidate of adbCandidates()) {
    try {
      await execFileAsync(candidate, ['version'], { timeout: 5000 })
      return candidate
    } catch (error) {
      lastError = error.message || String(error)
    }
  }
  throw new Error(`ADB was not found. Install Android SDK platform-tools or set ADB_PATH. ${lastError}`)
}

export const runAdb = async (adbPath, deviceId, args, options = {}) => {
  const deviceArgs = deviceId ? ['-s', deviceId, ...args] : args
  try {
    const result = await execFileAsync(adbPath, deviceArgs, {
      timeout: options.timeout || 60000,
      encoding: options.encoding || 'utf8',
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    })
    return { ok: true, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || String(error),
    }
  }
}

const parseDetails = (tokens) => Object.fromEntries(tokens
  .map((token) => token.split(':'))
  .filter(([key, value]) => key && value))

export const listDevices = async () => {
  const adbPath = await resolveAdbPath()
  const result = await runAdb(adbPath, '', ['devices', '-l'], { timeout: 10000 })
  if (!result.ok) throw new Error(`Could not list Android devices: ${result.stderr}`)

  const devices = String(result.stdout)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, state, ...tokens] = line.split(/\s+/)
      const details = parseDetails(tokens)
      return {
        id,
        state,
        type: id.startsWith('emulator-') ? 'emulator' : 'device',
        model: details.model || '',
        product: details.product || '',
      }
    })

  return devices
}

export const getForegroundApp = async (adbPath, deviceId) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await runAdb(adbPath, deviceId, ['shell', 'dumpsys', 'window'], {
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
    })
    const output = String(result.stdout || '')
    const focus = output.match(/mCurrentFocus=.*?\s([A-Za-z0-9._]+)\/([^\s}]+)/)
    if (result.ok && focus) return { packageName: focus[1], activityName: focus[2], windowDump: output }

    const activities = await runAdb(adbPath, deviceId, ['shell', 'dumpsys', 'activity', 'activities'], {
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
    })
    const resumed = String(activities.stdout || '').match(/topResumedActivity=.*?\s([A-Za-z0-9._]+)\/([^\s}\s]+)/)
    if (activities.ok && resumed) return { packageName: resumed[1], activityName: resumed[2], windowDump: output }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Could not determine the foreground Android app. Unlock the device and open the screen you want to capture.')
}

export const resolveAndroidSdkRoot = (adbPath) => {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT

  const standardRoots = [
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
  ].filter(Boolean)
  const standardRoot = standardRoots.find((root) => fs.existsSync(path.join(root, 'platform-tools')))
  if (standardRoot) return standardRoot

  const realAdbPath = fs.realpathSync(adbPath)
  return path.dirname(path.dirname(realAdbPath))
}
