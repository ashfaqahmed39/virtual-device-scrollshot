import fs from 'node:fs/promises'
import path from 'node:path'
import { captureFullPage } from '../src/index.js'

const output = path.resolve(process.env.OUTPUT || 'integration-full-page.png')
const result = await captureFullPage({
  deviceId: process.env.DEVICE_ID || '',
  verbose: process.env.VERBOSE === '1',
  logger: (message) => console.error(`[integration] ${message}`),
})
await fs.writeFile(output, result.buffer)
console.log(JSON.stringify({
  output,
  width: result.width,
  height: result.height,
  frameCount: result.frameCount,
  deviceId: result.deviceId,
  packageName: result.packageName,
}, null, 2))
