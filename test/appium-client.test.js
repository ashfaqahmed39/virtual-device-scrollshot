import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { createAppiumClient } from '../src/appium-client.js'

test('times out when Appium stops responding', async (context) => {
  const server = http.createServer(() => {})
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => new Promise((resolve) => server.close(resolve)))
  const address = server.address()

  await assert.rejects(
    createAppiumClient(`http://127.0.0.1:${address.port}`, {}, { requestTimeout: 50 }),
    /Appium request timed out after 50ms: POST \/session/,
  )
})
