import fs from 'node:fs/promises'
import path from 'node:path'
import { captureIosFullPage } from '../src/index.js'

const output = path.resolve(process.env.OUTPUT || 'integration-ios-full-page.png')
const result = await captureIosFullPage({
  deviceId: process.env.IOS_DEVICE_ID || '',
  verbose: process.env.VERBOSE === '1',
  logger: (message) => console.error(`[integration:ios] ${message}`),
})
await fs.writeFile(output, result.buffer)
console.log(JSON.stringify({
  output,
  width: result.width,
  height: result.height,
  frameCount: result.frameCount,
  deviceId: result.deviceId,
  platformVersion: result.platformVersion,
  bundleId: result.bundleId,
}, null, 2))
