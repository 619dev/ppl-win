<div align="center">
  <img src="public/icons/icon-512.png" width="128" height="128" alt="PaperPhoneLite" style="border-radius: 24px;" />
  <h1>PaperPhoneLite Desktop</h1>
  <p><strong>端对端加密即时通讯 Windows 桌面客户端</strong></p>
  <p><strong>End-to-End Encrypted Messaging Windows Desktop Client</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform" />
    <img src="https://img.shields.io/badge/Version-3.1.8-green?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/Electron-36-47848F?style=flat-square&logo=electron" alt="Electron" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License" />
  </p>
</div>

---

## 3.1.8 更新与兼容性（2026-11-26）

本版同步 PaperPhoneLite 共享前端 3.1.8（`db9fb80`）。

- 聊天控件、身份验证标记、群消息状态、二维码扫描和语言选择采用 Lucide 图标。聊天支持表情、最近使用的表情及贴纸。
- 群消息缺少密钥时显示等待状态，验证失败时显示警告图标。
- 在个人信息 → 账号删除中可选择连续未登录 3、6、12、24 或 36 个月后自动删除，默认 12 个月，成功登录后重新计时。该机制由 PaperPhoneLite 3.1.7 服务端执行。
- 已启用双重验证的账号可在登录页使用认证器验证码重置密码。服务端会撤销旧设备会话。
- Lite 继续提供 Tor 私聊与群聊，无朋友圈和时间线。

开发环境要求 Node.js 22+ 和 npm。在本 Windows 仓库执行 `npm ci`、`npm run typecheck`、`npm run test:security`、`npm run test:i18n`、`npm run build`。原生开发使用 `npm run dev:electron`；仅浏览器预览无法访问 Windows 系统安全存储。`npm run build:win` 将 Windows x64 安装包和便携版输出至 `release/3.1.8/`。

验证范围：自动测试使用网络和存储适配器；真实服务互通、Windows 安全存储、Tor 运行及 Windows 安装包仍需单独验证。参见[测试说明](tests/README.md)。

## 3.1.8 changes and compatibility (2026-11-26)

This release ports the shared PaperPhoneLite 3.1.8 frontend (`db9fb80`).

- Chat controls, identity verification badges, group message status, QR scanning, and language selection use Lucide icons. Chat supports emoji, recent emoji, and stickers.
- Group messages awaiting keys show a pending status. Verification failures show a warning icon.
- In Profile → Account Deletion, choose 3, 6, 12, 24, or 36 months of inactivity. The default is 12 months, and a successful sign-in restarts the countdown. The PaperPhoneLite 3.1.7 server performs account deletion.
- Accounts with two-factor authentication enabled can reset their password from the sign-in screen using an authenticator code. The server revokes existing device sessions after a reset.
- Lite continues to offer private and group chat over Tor, with no social feed or timeline.

Development requires Node.js 22+ and npm. From this Windows repository run `npm ci`, `npm run typecheck`, `npm run test:security`, `npm run test:i18n`, and `npm run build`. Use `npm run dev:electron` for the native bridge; browser-only preview cannot access Windows secure storage. `npm run build:win` packages Windows x64 NSIS and portable executables under `release/3.1.8/`.

Validation scope: automated crypto/sync/localization tests use network and storage adapters. Live interoperability, Windows secure storage, Tor runtime and Windows installer checks require separate validation. See [test notes](tests/README.md).

## 📖 Documentation / 文档

- [中文文档 (Chinese)](README_CN.md)
- [English Documentation](README_EN.md)

## 更新日志

完整版本更新记录已迁移至 [changelog.md](changelog.md)。

---

## 🔐 Extra-encrypted text appearance: design and security boundary

Text appearance adds a password-protected layer to new private messages before end-to-end encryption (E2EE). Private chats remain protected by the X25519 key agreement, XSalsa20-Poly1305 encryption, and Ed25519 message signatures; group chats continue to use the Sender Key protocol. Identity private keys and group Sender Keys remain protected by Windows secure storage.

When enabled, every message is processed in this order:

1. The sender first protects the message body with the extra password shared by both private-chat participants. PBKDF2-SHA-256 (210,000 iterations and a random salt) derives an AES-256-GCM key; every message has an independent random IV and an authentication tag for integrity.
2. The complete extra-encryption frame (version, salt, IV, and ciphertext) is then encoded with one of eight selectable text appearances. This is not merely decorative character substitution: the visible characters carry the extra encrypted ciphertext.
3. The client encrypts the appearance ciphertext using private-chat E2EE. The server receives the resulting ciphertext and delivery metadata.
4. The recipient reverses the order: first decrypt the private-chat E2EE layer, then decode the text-appearance frame and decrypt the body with the extra password.

The extra password is never uploaded, synchronized automatically, or distributed by the server. Both people in a private chat must set the same password; older group messages protected by this layer still require the original password. Text appearances do not need to match: every message carries its own appearance identifier, so the recipient automatically detects and decodes the sender's choice. For example, one person may send Buddhist text while another sends Hangul; if the extra password matches, both decrypt normally. A user's appearance setting controls only the ciphertext appearance of messages they send. If the password is missing, locked, or different, messages are still sent and received normally and the original E2EE layer still decrypts successfully, but the app can display only the appearance ciphertext—not the original text.

The app does not persist the extra password. While unlocked it exists only in the current process memory; locally, the app stores only a random salt and AES-GCM verification data used to check whether an entered password is correct. Users can lock immediately or automatically 5, 15, 30, or 60 minutes after the app leaves the foreground. This layer adds an independent shared secret beyond E2EE; it does not replace a strong password, device lock, or system secure storage, and it cannot provide absolute protection on a fully compromised device while the password remains in memory.

## 🔐 额外加密文本外观：工作原理与安全边界

文本外观功能在端到端加密（E2EE）之前，为新私聊消息增加一层密码加密。私聊仍由 X25519 密钥协商、XSalsa20-Poly1305 加密和 Ed25519 消息签名保护；群聊仍使用 Sender Key 协议。身份私钥和群聊 Sender Key 继续由 Windows 系统安全存储保护。

启用后，每条消息按以下顺序处理：

1. 发送方先用私聊双方约定的额外密码处理消息正文。密码通过 PBKDF2-SHA-256（210,000 次迭代及随机盐）派生 AES-256-GCM 密钥；每条消息使用独立随机 IV，并通过认证标签校验完整性。
2. 额外加密后的完整数据帧（版本、盐、IV 和密文）再转换成所选的 8 种文本外观之一。这不是单纯替换字符的装饰效果，外观字符实际承载的是额外加密密文。
3. 客户端再对文本外观密文进行私聊端到端加密。服务器接收最终密文和投递所需的元数据。
4. 接收端执行相反流程：先解开私聊端到端加密层，再还原文本外观数据，并用额外密码解密出正文。

额外密码不会上传、自动同步或由服务器分发。私聊双方必须设置相同密码；使用额外加密的历史群消息仍需原密码。文本外观不需要一致：每条消息都会携带自己的外观类型标记，接收端会自动识别并还原发送方选择的外观。例如一方发送“与佛论禅”、另一方发送“韩文”，只要额外密码相同，双方都能正常解密；每个人的外观设置只决定自己发出的密文样式。密码缺失、仍处于锁定状态或密码不一致时，消息依然能够正常发送、接收并完成原有 E2EE 解密，但应用只能显示文本外观密文，无法显示原文。

应用不会持久保存额外密码：解锁后密码只保留在当前运行内存中，本地仅保存随机盐和用于验证密码是否正确的 AES-GCM 验证数据。用户可以立即锁定，也可在应用离开前台 5、15、30 或 60 分钟后自动锁定。此额外层用于在原有 E2EE 之外增加一个独立的共享秘密；它不能替代强密码、设备锁、系统安全存储，也不能在设备已被完全控制且密码仍驻留内存时提供绝对保护。

## 📄 License / 许可证

This project is built upon [PaperPhoneLite](https://github.com/619dev/PaperPhoneLite) and is licensed under the [AGPL-3.0](LICENSE).

本项目基于 [PaperPhoneLite](https://github.com/619dev/PaperPhoneLite) 开发，采用 [AGPL-3.0](LICENSE) 许可证发布。
