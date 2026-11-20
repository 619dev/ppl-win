<div align="center">
  <img src="public/icons/icon-512.png" width="128" height="128" alt="PaperPhoneLite" style="border-radius: 24px;" />
  <h1>PaperPhoneLite Desktop</h1>
  <p><strong>End-to-End Encrypted Messaging Windows Desktop Client</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform" />
    <img src="https://img.shields.io/badge/Version-3.1.7-green?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron" alt="Electron" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License" />
  </p>
</div>

---

## 3.1.7 changes and compatibility (2026-11-21)

This release ports the shared PaperPhoneLite 3.1.7 frontend (`cb0fe15`).

- Avatars and media are cached persistently per account. Encrypted chat attachments are cached as ciphertext. Clear offline data in Profile.
- In Profile → Account Deletion, choose 3, 6, 12, 24, or 36 months of inactivity. The default is 12 months, and a successful sign-in restarts the countdown. The PaperPhoneLite 3.1.7 server performs account deletion.
- Accounts with two-factor authentication enabled can reset their password from the sign-in screen using an authenticator code. The server revokes existing device sessions after a reset.
- Lite continues to offer private and group chat over Tor, with no social feed or timeline.

Development requires Node.js 22+ and npm. From this Windows repository run `npm ci`, `npm run typecheck`, `npm run test:security`, `npm run test:i18n`, and `npm run build`. Use `npm run dev:electron` for the native bridge; browser-only preview cannot access Windows secure storage. `npm run build:win` packages Windows x64 NSIS and portable executables under `release/3.1.7/`.

Validation scope: automated crypto/sync/localization tests use network and storage adapters. Live interoperability, Windows secure storage, Tor runtime and Windows installer checks require separate validation. See [test notes](tests/README.md).

## 📖 Introduction

PaperPhoneLite Desktop is the Windows desktop client of [PaperPhoneLite](https://github.com/619dev/PaperPhoneLite), built with Electron. It wraps the original React frontend into a native desktop application with full instant messaging capabilities and built-in network proxy support.

## ✨ Features

### Changelog

The complete release history has moved to [changelog.md](changelog.md).

---

### 💬 Instant Messaging
- Private & group chat with text, images, videos, files, and voice messages
- Contact management, QR code friend requests
- Lite excludes private/group voice and video calls, Moments, Timeline, and the Discover page

### 🔐 End-to-End Encryption
- **E2EE**: All messages encrypted before sending; the server cannot read them
- **Message authentication**: Ed25519 signatures bind private messages to their sender, recipient, type, and encrypted payload.
- **Actual sending path**: X25519 + XSalsa20-Poly1305 + Ed25519; ML-KEM is not enabled in signed sends. This is not a Double Ratchet implementation.
- **Crypto Library**: libsodium (X25519, XSalsa20-Poly1305, Ed25519)

### 🌐 Tor networking
- Embedded Tor and WebTunnel for Windows x64
- Tor starts automatically; login waits for complete bootstrap
- Electron HTTP and WebSocket traffic uses the local Tor SOCKS listener
- The Profile proxy entry and subpage have been removed; embedded Tor manages networking

### 🖥️ Desktop Features
- Windows x64 (NSIS + portable)
- Telegram-style desktop layout (left sidebar + right main panel)
- Draggable sidebar width (280px–480px)
- Window position & size persistence
- External links open in system browser
- Dark mode support

## 🔐 Extra-encrypted text appearance: design and security boundary

Text appearance adds a password-protected layer to new private messages before end-to-end encryption (E2EE). Private chats remain protected by the X25519 key agreement, XSalsa20-Poly1305 encryption, and Ed25519 message signatures; group chats continue to use the Sender Key protocol. Identity private keys and group Sender Keys remain protected by Windows secure storage.

When enabled, every message is processed in this order:

1. The sender first protects the message body with the extra password shared by both private-chat participants. PBKDF2-SHA-256 (210,000 iterations and a random salt) derives an AES-256-GCM key; every message has an independent random IV and an authentication tag for integrity.
2. The complete extra-encryption frame (version, salt, IV, and ciphertext) is then encoded with one of eight selectable text appearances. This is not merely decorative character substitution: the visible characters carry the extra encrypted ciphertext.
3. The client encrypts the appearance ciphertext using private-chat E2EE. The server receives the resulting ciphertext and delivery metadata.
4. The recipient reverses the order: first decrypt the private-chat E2EE layer, then decode the text-appearance frame and decrypt the body with the extra password.

The extra password is never uploaded, synchronized automatically, or distributed by the server. Both people in a private chat must set the same password; older group messages protected by this layer still require the original password. Text appearances do not need to match: every message carries its own appearance identifier, so the recipient automatically detects and decodes the sender's choice. For example, one person may send Buddhist text while another sends Hangul; if the extra password matches, both decrypt normally. A user's appearance setting controls only the ciphertext appearance of messages they send. If the password is missing, locked, or different, messages are still sent and received normally and the original E2EE layer still decrypts successfully, but the app can display only the appearance ciphertext—not the original text.

The app does not persist the extra password. While unlocked it exists only in the current process memory; locally, the app stores only a random salt and AES-GCM verification data used to check whether an entered password is correct. Users can lock immediately or automatically 5, 15, 30, or 60 minutes after the app leaves the foreground. This layer adds an independent shared secret beyond E2EE; it does not replace a strong password, device lock, or system secure storage, and it cannot provide absolute protection on a fully compromised device while the password remains in memory.

## 📦 Installation

### Download from Releases

Published installers are available on the [Releases](../../releases) page. The following are the expected filenames when packaging 3.1.7 locally:

| File | Description |
|------|-------------|
| `PaperPhoneLite-3.1.7-Windows-Setup.exe` | NSIS installer |
| `PaperPhoneLite-3.1.7-Windows-Portable.exe` | Portable executable |

The 3.1.7 packaging configuration targets Windows x64 with NSIS and portable executables.

## 🧅 Embedded Tor and WebTunnel

The Windows client embeds the official Tor Project Tor and lyrebird runtimes for Windows x64. It starts Tor automatically and switches Electron networking to the local SOCKS5 listener. If direct bootstrap has not completed within 20 seconds, it fetches and validates a WebTunnel bridge from Tor Project Moat, caches a valid bridge, and restarts Tor. Authentication remains disabled until Tor reaches 100% bootstrap, with no clearnet fallback for `.onion` requests.

If Moat is temporarily unavailable, the client tries the last successfully cached bridge. The login screen displays live bootstrap status and provides manual retry.

### Build from Source

#### Prerequisites

- Node.js >= 22
- npm >= 9
- Windows system

#### Steps

```bash
# Use this Windows repository (the shared upstream client has no Electron packaging)
cd /path/to/ppl-win

# Install dependencies
npm ci

# Development mode (Vite HMR + Electron)
npm run dev:electron

# Production build
npm run build

# Package for Windows
npm run build:win
```

## 🔧 Network operation

Start the desktop app and wait for Tor bootstrap to reach 100%. If direct bootstrap takes longer than 20 seconds, the embedded runtime tries a validated WebTunnel bridge from Moat or its last valid cached bridge. The login screen offers retry. The Windows Profile proxy entry and subpage have been removed, following the desktop layout introduced in 3.1.1.

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│            Electron Main Process         │
│  ┌─────────┐  ┌──────────┐  ┌────────┐ │
│  │  Proxy  │  │  Window  │  │  IPC   │ │
│  │ Manager │  │ Manager  │  │Handler │ │
│  └─────────┘  └──────────┘  └────────┘ │
│       ↕ session.setProxy()    ↕ IPC     │
├─────────────────────────────────────────┤
│          Preload (contextBridge)         │
├─────────────────────────────────────────┤
│          Renderer (React 19 + Vite)      │
│       ┌──────┐       ┌──────────┐       │
│       │Login │       │  Chats   │       │
│       └──────┘       └──────────┘       │
│  ┌─────────────────────────────────┐   │
│  │  Crypto (libsodium signatures)     │   │
│  │  Signed private/group E2EE          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------:|
| Desktop Framework | Electron 36 |
| Frontend | React 19 + TypeScript 5.7 |
| Build Tool | Vite 6 |
| State Management | Zustand 5 |
| Encryption | libsodium-wrappers-sumo + crystals-kyber-js |
| Packaging | electron-builder |
| Persistence | electron-store |

## 📁 Project Structure

```
├── electron/
│   ├── main.ts          # Main process: window, proxy, IPC
│   └── preload.ts       # Preload: secure API bridge
├── src/
│   ├── api/             # HTTP, WebSocket, proxy bridge
│   ├── components/      # UI components
│   ├── crypto/          # E2EE encryption modules
│   ├── hooks/           # Custom hooks
│   ├── i18n/            # Internationalization
│   ├── pages/           # Page components
│   ├── store/           # Zustand state management
│   ├── utils/           # Utility functions
│   ├── App.tsx          # React root component
│   ├── electron.d.ts    # Electron API type declarations
│   ├── index.css        # Global styles
│   ├── main.tsx         # React entry point
│   └── vite-env.d.ts    # Vite type declarations
├── build/               # App icon assets
├── electron-builder.yml # Packaging configuration
├── tsconfig.electron.json # Electron TypeScript config
├── vite.config.ts       # Vite build configuration
└── package.json         # Project configuration
```

## 📄 License

This project is built upon [PaperPhoneLite](https://github.com/619dev/PaperPhoneLite) and is licensed under the [AGPL-3.0](LICENSE).
