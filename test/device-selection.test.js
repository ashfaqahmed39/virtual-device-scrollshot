import assert from 'node:assert/strict'
import test from 'node:test'
import { selectDevice } from '../src/device-selection.js'

const emulator = { id: 'emulator-5554', state: 'device', type: 'emulator', model: 'Pixel_7' }
const phone = { id: 'R58M1234', state: 'device', type: 'device', model: 'Galaxy_S23' }

test('auto-selects the only online device', () => {
  assert.equal(selectDevice([emulator], '').id, 'emulator-5554')
})

test('selects an explicitly requested device', () => {
  assert.equal(selectDevice([emulator, phone], 'R58M1234').id, 'R58M1234')
})

test('requires --device when multiple devices are online', () => {
  assert.throws(() => selectDevice([emulator, phone], ''), /Multiple Android devices/)
})

test('rejects offline and missing devices', () => {
  assert.throws(() => selectDevice([{ ...emulator, state: 'offline' }], 'emulator-5554'), /offline/)
  assert.throws(() => selectDevice([emulator], 'missing'), /not connected/)
})
