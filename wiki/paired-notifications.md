---
type: Compatibility Decision
title: Paired Android notifications
description: Preserve session-owned direct delivery and encrypted rich Android notifications using shared Connect policy.
tags: [fork, android, notifications, privacy]
status: experimental
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-10-10T19:02:34Z
sources:
  - id: paired-delivery
    resource: ../apps/server/src/notifications/PairedNotifications.ts
    title: Session-owned direct FCM delivery
  - id: paired-operations
    resource: ../docs/operations/android-notifications.md
    title: Firebase, fnox and private APK operational requirements
---

# Paired Android notifications

The fork supports Google notification delivery without routing activity through T3 Connect. Preserve the existing pairing/session authorization boundary: notification subscriptions do not introduce another account or pairing identity. Generic completion delivery was verified on Nicholas's Galaxy S23 against the remote environment on October 10, 2026; encrypted rich delivery requires a new Android binary and an updated sending server.[^paired-delivery]

Reuse the shared Connect notification policy and native presentation, not a second set of alert rules. Rich titles, status and thread routes are allowed inside encrypted paired payloads; do not send them to FCM in plaintext or add conversation content. The phone retains the private key and supplies only its public key through the existing authenticated registration. Preserve registration binding, freshness, ordering, opt-out, session revocation and independent per-environment state. Connect sign-out must not clear paired keys or activity. Thread access after a notification tap still requires the environment's normal authentication.[^paired-delivery]

Google still processes device identifiers and delivery metadata. This reduces transmitted content, not a compliance guarantee. Private binaries must retain their package and signing identity and use the same Firebase project as the sending server.[^paired-operations]

[^paired-delivery]: [Paired notification service](../apps/server/src/notifications/PairedNotifications.ts).

[^paired-operations]: [Android notification operations](../docs/operations/android-notifications.md#self-hosted-paired-delivery).
