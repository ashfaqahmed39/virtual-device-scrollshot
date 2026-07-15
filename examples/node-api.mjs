import fs from 'node:fs/promises'
import { captureFullPage } from 'virtual-device-scrollshot'

const result = await captureFullPage({
  deviceId: process.env.DEVICE_ID || '',
  logger: console.log,
})

await fs.writeFile('full-page.png', result.buffer)
console.log(`Saved ${result.width}x${result.height} screenshot from ${result.packageName}`)
