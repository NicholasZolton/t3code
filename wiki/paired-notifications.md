---
type: Compatibility Decision
title: Paired Android notifications
description: Preserve direct paired delivery and opaque notification payloads when integrating upstream activity delivery.
tags: [fork, android, notifications, privacy]
status: experimental
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-10-10T17:55:51Z
sources:
  - id: paired-delivery
    resource: ../apps/server/src/notifications/PairedNotifications.ts
    title: Session-owned direct FCM delivery
  - id: paired-operations
    resource: ../docs/operations/android-notifications.md
    title: Firebase, fnox and private APK operational requirements
---

# Paired Android notifications

The fork supports Google notification delivery without routing activity through T3 Connect. Preserve the existing pairing/session authorization boundary: notification subscriptions do not introduce another account or pairing identity. Delivery remains experimental until verified on a physical phone against an updated sending server.[^paired-delivery]

Keep direct FCM messages opaque. Upstream's rich activity payloads are appropriate only for its separate T3 Connect path; do not reuse them for paired delivery or add project/thread titles, prompts or thread destinations. Taps resolve references through the authenticated environment, and Connect sign-out must not clear the paired native registrations.[^paired-delivery]

Google still processes device identifiers and delivery metadata. This reduces transmitted content, not a compliance guarantee. Private binaries must retain their package and signing identity and use the same Firebase project as the sending server.[^paired-operations]

[^paired-delivery]: [Paired notification service](../apps/server/src/notifications/PairedNotifications.ts).

[^paired-operations]: [Android notification operations](../docs/operations/android-notifications.md#self-hosted-paired-delivery).
