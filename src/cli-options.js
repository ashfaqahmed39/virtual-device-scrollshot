import { DEFAULT_MAX_FRAMES, DEFAULT_MAX_HEIGHT } from './constants.js'

const takeValue = (args, index, name) => {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

const parseNumber = (value, name) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number`)
  return number
}

export const parseCliArgs = (args) => {
  const options = {
    platform: 'android',
    deviceId: '',
    output: 'full-page.png',
    maxFrames: DEFAULT_MAX_FRAMES,
    maxHeight: DEFAULT_MAX_HEIGHT,
    scrollPercent: undefined,
    listDevices: false,
    verbose: false,
    help: false,
    version: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--platform') {
      options.platform = takeValue(args, index++, '--platform').toLowerCase()
      if (!['android', 'ios'].includes(options.platform)) throw new Error('--platform must be android or ios')
    } else if (argument === '--device') options.deviceId = takeValue(args, index++, '--device')
    else if (argument === '--output' || argument === '-o') options.output = takeValue(args, index++, argument)
    else if (argument === '--max-frames') options.maxFrames = parseNumber(takeValue(args, index++, '--max-frames'), '--max-frames')
    else if (argument === '--max-height') options.maxHeight = parseNumber(takeValue(args, index++, '--max-height'), '--max-height')
    else if (argument === '--scroll-percent') options.scrollPercent = parseNumber(takeValue(args, index++, '--scroll-percent'), '--scroll-percent')
    else if (argument === '--list-devices') options.listDevices = true
    else if (argument === '--verbose') options.verbose = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--version' || argument === '-v') options.version = true
    else throw new Error(`Unknown option: ${argument}`)
  }
  return options
}

export const helpText = `virtual-device-scrollshot

Capture a full-page screenshot from a foreground Android or iOS app.

Usage:
  virtual-device-scrollshot [options]

Options:
  --platform <name>       android (default) or ios
  --device <id>           ADB device id or iOS simulator UDID
  --output, -o <path>     Output PNG path (default: full-page.png)
  --max-frames <number>   Maximum captured frames (default: 20)
  --max-height <pixels>   Maximum output height (default: 30000)
  --scroll-percent <0-1>  Scroll amount (Android: 0.72, iOS: 0.4)
  --list-devices          List targets for the selected platform and exit
  --verbose               Show Appium logs
  --help, -h              Show help
  --version, -v           Show version

Examples:
  npx virtual-device-scrollshot --platform android
  npx virtual-device-scrollshot --platform ios --device <simulator-udid>
`
