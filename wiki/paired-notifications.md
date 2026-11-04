---
type: Compatibility Decision
title: Paired Android notifications
description: Preserve session-owned direct delivery and encrypted rich Android notifications using shared Connect policy.
tags: [fork, android, notifications, privacy]
status: experimental
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-11-04T00:47:48Z
sources:
  - id: paired-delivery
    resource: ../apps/server/src/notifications/PairedNotifications.ts
    title: Session-owned direct FCM delivery
  - id: paired-operations
    resource: ../docs/operations/android-notifications.md
    title: Firebase, fnox and private APK operational requirements
  - id: desktop-credentials
    resource: ../apps/desktop/src/shell/DesktopShellEnvironment.ts
    title: macOS Keychain fallback before local backend startup
  - id: paired-settings-entry
    resource: ../apps/mobile/src/features/settings/SettingsRouteScreen.tsx
    title: Shared notification settings entry for local-only and Connect-configured builds
  - id: paired-settings-test
    resource: ../apps/mobile/src/features/settings/SettingsRouteScreen.test.tsx
    title: Notification settings remain visible without cloud configuration
  - id: original-settings-entry
    resource: https://github.com/NicholasZolton/t3code/commit/faf154ec9fa11671e1cdf348637ddd8899c94551
    title: October 10 paired notifications added the local-only settings entry
  - id: settings-regression-integration
    resource: https://github.com/NicholasZolton/t3code/commit/ed52b86b6a9ffb6afad94980cc3d7d8cb5c851aa
    title: November upstream settings integration omitted the fork's local-only notification entry
---

# Paired Android notifications

The fork supports Google notification delivery without routing activity through T3 Connect. Preserve the existing pairing/session authorization boundary: notification subscriptions do not introduce another account or pairing identity. Generic completion delivery was verified on Nicholas's Galaxy S23 against the remote environment on October 10, 2026; encrypted rich delivery requires a new Android binary and an updated sending server.[^paired-delivery]

Reuse the shared Connect notification policy and native presentation, not a second set of alert rules. Rich titles, status and thread routes are allowed inside encrypted paired payloads; do not send them to FCM in plaintext or add conversation content. The phone retains the private key and supplies only its public key through the existing authenticated registration. Preserve registration binding, freshness, ordering, opt-out, session revocation and independent per-environment state. Connect sign-out must not clear paired keys or activity. Thread access after a notification tap still requires the environment's normal authentication.[^paired-delivery]

Keep the mobile notification settings entry available without T3 Connect configuration. The paired settings screen already handles that build mode; gating its navigation on cloud configuration makes Android opt-in unreachable. The October 10 fork added this entry, but the November upstream settings integration dropped it from the local-only list. Shared connection rows and a cloud-configuration regression test preserve this boundary.[^paired-settings-entry][^paired-settings-test][^original-settings-entry][^settings-regression-integration]

Google still processes device identifiers and delivery metadata. This reduces transmitted content, not a compliance guarantee. Private binaries must retain their package and signing identity and use the same Firebase project as the sending server.[^paired-operations]

Finder/Dock launches cannot rely on a fnox-wrapped shell. The macOS desktop can load the existing Firebase credential from login Keychain before spawning its local server, while preserving an explicitly supplied environment variable. Keep this fallback desktop-local: it must not forward credentials to SSH hosts or require a checkout-specific secret manager.[^desktop-credentials]

[^paired-delivery]: [Paired notification service](../apps/server/src/notifications/PairedNotifications.ts).

[^paired-operations]: [Android notification operations](../docs/operations/android-notifications.md#self-hosted-paired-delivery).

[^desktop-credentials]: [Desktop startup environment](../apps/desktop/src/shell/DesktopShellEnvironment.ts).

[^paired-settings-entry]: [Mobile settings connections](../apps/mobile/src/features/settings/SettingsRouteScreen.tsx).

[^paired-settings-test]: [Cloud-independent notification navigation test](../apps/mobile/src/features/settings/SettingsRouteScreen.test.tsx).

[^original-settings-entry]: [Original paired-notification settings entry](https://github.com/NicholasZolton/t3code/commit/faf154ec9fa11671e1cdf348637ddd8899c94551).

[^settings-regression-integration]: [Upstream settings integration](https://github.com/NicholasZolton/t3code/commit/ed52b86b6a9ffb6afad94980cc3d7d8cb5c851aa).
