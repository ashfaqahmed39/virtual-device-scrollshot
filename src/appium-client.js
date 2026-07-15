const DEFAULT_REQUEST_TIMEOUT_MS = 300000

const request = async (serverUrl, method, requestPath, body, timeoutMs) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${serverUrl}${requestPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.value?.error) {
      throw new Error(payload.value?.message || payload.message || `Appium request failed with HTTP ${response.status}`)
    }
    return payload.value
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Appium request timed out after ${timeoutMs}ms: ${method} ${requestPath}`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const createAppiumClient = async (serverUrl, capabilities, { requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS } = {}) => {
  const appiumRequest = (method, requestPath, body, timeoutMs = requestTimeout) => request(
    serverUrl,
    method,
    requestPath,
    body,
    timeoutMs,
  )
  const session = await appiumRequest('POST', '/session', {
    capabilities: { alwaysMatch: capabilities, firstMatch: [{}] },
  })
  const sessionId = session?.sessionId
  if (!sessionId) throw new Error('Appium did not return a session id')
  const basePath = `/session/${encodeURIComponent(sessionId)}`
  const execute = (script, args = []) => appiumRequest('POST', `${basePath}/execute/sync`, { script, args })
  const findElements = (using, value) => appiumRequest('POST', `${basePath}/elements`, { using, value })

  return {
    getCurrentPackage: () => appiumRequest('GET', `${basePath}/appium/device/current_package`),
    execute,
    findElements,
    getActiveAppInfo: () => execute('mobile: activeAppInfo'),
    getWindowRect: () => appiumRequest('GET', `${basePath}/window/rect`),
    getSourceTree: () => execute('mobile: source', [{ format: 'json' }]),
    findScrollableElements: () => findElements('xpath', '//*[@scrollable="true"]'),
    getElementRect: (elementId) => appiumRequest('GET', `${basePath}/element/${encodeURIComponent(elementId)}/rect`),
    scrollGesture: (options) => execute('mobile: scrollGesture', [options]),
    scrollIos: (elementId, direction, distance) => execute('mobile: scroll', [{ elementId, direction, distance }]),
    takeScreenshot: () => appiumRequest('GET', `${basePath}/screenshot`),
    deleteSession: () => appiumRequest('DELETE', basePath, undefined, 10000),
  }
}
