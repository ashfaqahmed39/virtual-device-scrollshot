import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const run = async (command, args) => {
  try {
    return await execFileAsync(command, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 })
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || error).trim()
    throw new Error(`${command} failed${detail ? `: ${detail}` : ''}`)
  }
}

export const listIosSimulators = async () => {
  if (process.platform !== 'darwin') return []
  const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])
  const data = JSON.parse(stdout)
  return Object.values(data.devices || {})
    .flat()
    .filter((device) => device?.isAvailable)
    .map((device) => ({
      id: device.udid,
      name: device.name,
      platform: 'ios',
      state: device.state,
      type: 'simulator',
    }))
}

export const selectIosSimulator = (devices, requestedId = '') => {
  if (requestedId) {
    const selected = devices.find((device) => device.id === requestedId)
    if (!selected) throw new Error(`iOS simulator "${requestedId}" is not available`)
    if (selected.state !== 'Booted') throw new Error(`iOS simulator "${requestedId}" is ${selected.state}`)
    return selected
  }

  const booted = devices.filter((device) => device.state === 'Booted')
  if (!booted.length) throw new Error('No Booted iOS simulator was found')
  if (booted.length > 1) {
    const choices = booted.map((device) => `  ${device.id} (${device.name})`).join('\n')
    throw new Error(`Multiple iOS simulators are Booted. Select one with --device:\n${choices}`)
  }
  return booted[0]
}

export const getIosPlatformVersion = async (deviceId) => {
  const { stdout } = await run('xcrun', ['simctl', 'getenv', deviceId, 'SIMULATOR_RUNTIME_VERSION'])
  const version = stdout.trim()
  if (!version) throw new Error('Could not determine the selected iOS simulator runtime')
  return version
}
