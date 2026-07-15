import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { areIosFramesEquivalent, scaleIosScrollRect, stitchIosFrames } from '../src/ios-image-stitcher.js'

const image = (color) => sharp({
  create: { width: 200, height: 400, channels: 4, background: color },
}).png().toBuffer()

test('scales iOS coordinates and excludes fixed chrome', async () => {
  const rect = await scaleIosScrollRect(
    await image('#ffffff'),
    { x: 0, y: 20, width: 100, height: 160 },
    { x: 0, y: 0, width: 100, height: 200 },
    [
      { x: 0, y: 20, width: 100, height: 20 },
      { x: 0, y: 160, width: 100, height: 20 },
    ],
  )

  assert.deepEqual(rect.sourceRect, { x: 0, y: 40, width: 100, height: 120 })
  assert.equal(rect.top, 80)
  assert.equal(rect.height, 240)
  assert.equal(rect.scaleY, 2)
})

test('detects equivalent iOS frames and returns one frame unchanged', async () => {
  const frame = await image('#336699')
  const scrollRect = { x: 0, y: 40, width: 200, height: 300, left: 0, top: 40, right: 200, bottom: 340 }
  assert.equal(await areIosFramesEquivalent(frame, frame, scrollRect), true)
  assert.deepEqual(await stitchIosFrames([{ image: frame, anchors: [] }], scrollRect, { maxHeight: 30000 }), frame)
})
