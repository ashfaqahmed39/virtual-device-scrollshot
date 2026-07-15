#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { captureFullPage, captureIosFullPage, listDevices, listIosSimulators } from '../src/index.js'
import { helpText, parseCliArgs } from '../src/cli-options.js'
import { PACKAGE_VERSION } from '../src/constants.js'

const formatDevice = (device) => {
  const label = device.model || device.product || device.name
  return `${device.id}\t${device.state}\t${device.type}${label ? `\t${label}` : ''}`
}

const main = async () => {
  const options = parseCliArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(helpText)
    return
  }
  if (options.version) {
    console.log(PACKAGE_VERSION)
    return
  }
  if (options.listDevices) {
    const devices = options.platform === 'ios' ? await listIosSimulators() : await listDevices()
    if (!devices.length) console.log(`No ${options.platform === 'ios' ? 'iOS simulators' : 'Android devices'} found.`)
    else devices.forEach((device) => console.log(formatDevice(device)))
    return
  }

  const capture = options.platform === 'ios' ? captureIosFullPage : captureFullPage
  const result = await capture({
    deviceId: options.deviceId,
    maxFrames: options.maxFrames,
    maxHeight: options.maxHeight,
    scrollPercent: options.scrollPercent,
    verbose: options.verbose,
    logger: (message) => console.error(`[capture] ${message}`),
  })
  const outputPath = path.resolve(options.output)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, result.buffer)
  console.log(`Saved ${result.width}x${result.height} PNG to ${outputPath}`)
  console.log(`Platform: ${options.platform} | Device: ${result.deviceId} | App: ${result.packageName || result.bundleId} | Frames: ${result.frameCount}`)
}

main().catch((error) => {
  console.error(`Error: ${error.message || error}`)
  process.exitCode = 1
})
