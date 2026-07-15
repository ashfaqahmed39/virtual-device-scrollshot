# Security Policy

## Supported Versions

Security fixes are applied to the latest published version.

## Reporting a Vulnerability

Do not open a public issue for a security vulnerability. Use GitHub private vulnerability reporting or email the maintainer at `ashfaqahmed3339@gmail.com`.

Include the affected version, host OS, target platform/version, reproduction steps, and potential impact. You can expect an initial response within seven days.

## Runtime Security

- Appium binds only to `127.0.0.1` on a temporary port.
- The package does not expose a persistent web service.
- Screenshots remain on the local machine.
- The package does not reset, reinstall, or clear the target app.
