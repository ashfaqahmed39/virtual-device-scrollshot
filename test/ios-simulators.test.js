import assert from 'node:assert/strict'
import test from 'node:test'
import { selectIosSimulator } from '../src/ios-simulators.js'

const devices = [
  { id: 'booted-id', name: 'iPhone 16', state: 'Booted' },
  { id: 'shutdown-id', name: 'iPhone 15', state: 'Shutdown' },
]

test('selects the only booted iOS simulator', () => {
  assert.equal(selectIosSimulator(devices).id, 'booted-id')
  assert.equal(selectIosSimulator(devices, 'booted-id').name, 'iPhone 16')
})

test('rejects unavailable, shutdown, and ambiguous iOS simulators', () => {
  assert.throws(() => selectIosSimulator(devices, 'missing'), /not available/)
  assert.throws(() => selectIosSimulator(devices, 'shutdown-id'), /Shutdown/)
  assert.throws(() => selectIosSimulator([{ ...devices[0] }, { ...devices[0], id: 'second-id' }]), /Multiple/)
})
