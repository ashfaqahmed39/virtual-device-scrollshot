# CLI Examples

Auto-select the only connected device:

```bash
npx virtual-device-scrollshot
```

Select a specific emulator:

```bash
npx virtual-device-scrollshot --device emulator-5554 --output result.png
```

Capture a longer page:

```bash
npx virtual-device-scrollshot --max-frames 30 --max-height 60000
```
