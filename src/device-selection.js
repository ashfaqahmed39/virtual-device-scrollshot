export const selectDevice = (devices, requestedId) => {
  if (requestedId) {
    const selected = devices.find((device) => device.id === requestedId)
    if (!selected) throw new Error(`Android device "${requestedId}" is not connected`)
    if (selected.state !== 'device') throw new Error(`Android device "${requestedId}" is ${selected.state}`)
    return selected
  }

  const online = devices.filter((device) => device.state === 'device')
  if (!online.length) throw new Error('No online Android emulator or USB device was found')
  if (online.length > 1) {
    const choices = online.map((device) => `  ${device.id}${device.model ? ` (${device.model})` : ''}`).join('\n')
    throw new Error(`Multiple Android devices are connected. Select one with --device:\n${choices}`)
  }
  return online[0]
}
