import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { stitchFrames } from '../src/image-stitcher.js'

const WIDTH = 160
const TOP = 20
const VIEWPORT = 120
const BOTTOM = 20
const CONTENT_HEIGHT = 480

const contentPixel = (x, y) => [
  (y * 7 + x * 3) % 256,
  (y * 11 + x) % 256,
  (Math.floor(y / 10) * 31 + x * 5) % 256,
]

const createFrame = async (offset) => {
  const height = TOP + VIEWPORT + BOTTOM
  const pixels = Buffer.alloc(WIDTH * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const color = y < TOP
        ? [20, 80, 140]
        : y >= TOP + VIEWPORT
          ? [30, 30, 30]
          : contentPixel(x, offset + y - TOP)
      const index = (y * WIDTH + x) * 3
      pixels[index] = color[0]
      pixels[index + 1] = color[1]
      pixels[index + 2] = color[2]
    }
  }
  return sharp(pixels, { raw: { width: WIDTH, height, channels: 3 } }).png().toBuffer()
}

test('stitches overlapping viewports without repeated system bars', async () => {
  const frames = await Promise.all([0, 80, 160, 240].map(createFrame))
  const result = await stitchFrames(frames, { x: 0, y: TOP, width: WIDTH, height: VIEWPORT })
  const metadata = await sharp(result).metadata()
  assert.equal(metadata.width, WIDTH)
  assert.equal(metadata.height, TOP + 360 + BOTTOM)

  const topPixel = await sharp(result).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
  const bottomPixel = await sharp(result).extract({ left: 0, top: metadata.height - 1, width: 1, height: 1 }).raw().toBuffer()
  assert.deepEqual([...topPixel.slice(0, 3)], [20, 80, 140])
  assert.deepEqual([...bottomPixel.slice(0, 3)], [30, 30, 30])
})

test('returns a single frame unchanged', async () => {
  const frame = await createFrame(CONTENT_HEIGHT - VIEWPORT)
  const result = await stitchFrames([frame], { x: 0, y: TOP, width: WIDTH, height: VIEWPORT })
  assert.equal(result, frame)
})
