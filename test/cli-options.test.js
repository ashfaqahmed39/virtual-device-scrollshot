import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCliArgs } from '../src/cli-options.js'

test('uses documented defaults', () => {
  assert.deepEqual(parseCliArgs([]), {
    platform: 'android',
    deviceId: '',
    output: 'full-page.png',
    maxFrames: 20,
    maxHeight: 30000,
    scrollPercent: undefined,
    listDevices: false,
    verbose: false,
    help: false,
    version: false,
  })
})

test('parses capture options', () => {
  const options = parseCliArgs([
    '--platform', 'ios',
    '--device', 'emulator-5554',
    '-o', 'result.png',
    '--max-frames', '12',
    '--max-height', '20000',
    '--scroll-percent', '0.65',
    '--verbose',
  ])
  assert.equal(options.platform, 'ios')
  assert.equal(options.deviceId, 'emulator-5554')
  assert.equal(options.output, 'result.png')
  assert.equal(options.maxFrames, 12)
  assert.equal(options.maxHeight, 20000)
  assert.equal(options.scrollPercent, 0.65)
  assert.equal(options.verbose, true)
})

test('rejects unknown and incomplete options', () => {
  assert.throws(() => parseCliArgs(['--unknown']), /Unknown option/)
  assert.throws(() => parseCliArgs(['--device']), /requires a value/)
  assert.throws(() => parseCliArgs(['--platform', 'windows']), /android or ios/)
})
