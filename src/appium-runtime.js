import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appiumEntry = path.join(packageRoot, 'node_modules', 'appium', 'index.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForExit = (child, timeoutMs) => new Promise((resolve) => {
  if (child.exitCode !== null) {
    resolve(true)
    return
  }
  const finish = (exited) => {
    clearTimeout(timeout)
    child.off('exit', onExit)
    child.off('error', onExit)
    resolve(exited)
  }
  const onExit = () => finish(true)
  const timeout = setTimeout(() => finish(false), timeoutMs)
  child.once('exit', onExit)
  child.once('error', onExit)
})

const stopChild = async (child) => {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  if (await waitForExit(child, 5000)) return
  child.kill('SIGKILL')
  await waitForExit(child, 2000)
}

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.unref()
  server.on('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    server.close(() => resolve(port))
  })
})

const waitUntilReady = async (url, child) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Appium stopped before it became ready')
    try {
      const response = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      // Appium is still starting.
    }
    await sleep(250)
  }
  throw new Error('Appium did not become ready within 20 seconds')
}

export const startAppium = async ({ appiumHome, androidSdkRoot, verbose = false }) => {
  const port = await getFreePort()
  const args = [
    appiumEntry,
    '--address', '127.0.0.1',
    '--port', String(port),
    '--log-level', verbose ? 'info' : 'warn',
  ]
  const androidEnvironment = androidSdkRoot ? {
    ANDROID_HOME: androidSdkRoot,
    ANDROID_SDK_ROOT: androidSdkRoot,
  } : {}
  const child = spawn(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      APPIUM_HOME: appiumHome,
      ...androidEnvironment,
    },
    stdio: verbose ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'ignore', 'inherit'],
  })
  const url = `http://127.0.0.1:${port}`

  try {
    await waitUntilReady(url, child)
  } catch (error) {
    await stopChild(child)
    throw error
  }

  let stopPromise = null
  return {
    url,
    stop() {
      stopPromise ||= stopChild(child)
      return stopPromise
    },
  }
}
