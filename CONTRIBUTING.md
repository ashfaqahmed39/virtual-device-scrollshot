# Contributing

Thank you for contributing to Virtual Device Scrollshot.

## Development Setup

```bash
git clone https://github.com/ashfaqahmed39/virtual-device-scrollshot.git
cd virtual-device-scrollshot
npm install
npm run check
npm test
```

## Pull Requests

- Keep changes focused and backward compatible where practical.
- Add or update tests for capture and stitching behavior.
- Run `npm run check` and `npm test` before submitting.
- Do not commit generated screenshots unless they belong in `docs/images` or test fixtures.
- Explain Android version, device type, app framework, and scroll-container type for capture fixes.

## Integration Testing

Open a scrollable Android app screen and run:

```bash
DEVICE_ID=emulator-5554 npm run test:integration
```

Integration screenshots are ignored by Git by default.
