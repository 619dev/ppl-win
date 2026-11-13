# Windows 3.1.5 security and localization tests

Release version: **3.1.5**. The Profile footer must display **PaperPhoneLite v3.1.5**, matching package metadata and both Windows artifacts.

Run from this Windows repository with Node.js 22+:

```bash
npm ci
npm run typecheck
npm run test:security
npm run test:i18n
npm run build
```

Ported via macOS commit `84f577e` from the iOS 3.1.1 source (`c9b22d4`), originally imported from upstream `9bf6aaf`. The 3.1.5 changes come from macOS commit `3d3107b`.

- `authenticatedMessaging.test.cjs`: signed round trips, tampering, mutual verification, replay, key replacement and trust invalidation.
- `signedGroups.test.cjs`: signed distributions, membership, rotations, historical epochs, account isolation, group operation without private verification, and decryption of older text-appearance-protected group messages.
- `sync.test.cjs`: pagination, deduplication, asynchronous cache-before-cursor persistence, failures and account changes.
- `nativeCache.test.cjs`: native asynchronous cache writes, ciphertext-only persistence, disk failures, logout ordering and hydration account isolation.
- `securityI18n.test.cjs`: 92 security keys across eight languages, placeholders, duplicates and locale changes.

Crypto suites use real sodium, X25519, PBKDF2 and AES-GCM. Secret storage is mocked at the Windows secure-storage adapter; these tests do not validate the Windows secure storage, Electron IPC, Tor, notifications or a live server. Native development uses `npm run dev:electron`.

Windows packaging: run `npm run build:win` to produce x64 NSIS and portable executables. Validate installation, Lite/Plus shortcut isolation, Windows secure storage, Tor/WebTunnel, notifications, and cross-device messaging on Windows against a PaperPhoneLite 3.1.5 server. Check startup repair of one-sided friendships, list and request refresh on both clients, group sending without the private handshake, and offline recovery after membership changes. Automated suites do not establish live interoperability or OS integration.

See [English guide](../README_EN.md) / [中文说明](../README_CN.md).
