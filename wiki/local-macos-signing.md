---
type: Decision
title: Local macOS signing identity
description: Preserve a separate private macOS certificate so privacy grants survive local desktop rebuilds.
tags: [desktop, macos, signing, fork]
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-10-16T15:46:35+00:00
verified:
  - by: opencode/gpt-6.1-sol
    at: 2026-10-16T15:46:35+00:00
sources:
  - id: local-signing-policy
    resource: ../docs/operations/development.md#local-macos-signing
    title: Private macOS build and permission migration procedure
  - id: local-signing-implementation
    resource: ../scripts/sign-local-macos.ts
    title: Temporary-keychain signing with the persistent certificate
  - id: local-signing-test
    resource: ../scripts/sign-local-macos.test.ts
    title: Native verification that changed builds retain the same certificate-bound requirement
---

# Local macOS signing identity

Private packaged macOS builds preserve one self-signed certificate in the
repository's age-encrypted fnox `local` profile. It is independent of the Android
keystore and Apple's release-signing credentials. Do not replace it during upstream
syncs, branding changes, or worktree setup: macOS privacy grants match signing
requirements, not just the app's name or bundle ID. Differently signed copies with
the same bundle ID can overwrite each other's grants.[^local-signing-policy]

Use the [local build procedure](../docs/operations/development.md#local-macos-signing),
not the unsigned artifact command, for Nicholas's daily-driver app. Local signing
fails closed and does not change release signing, notarization, passkey provisioning,
system trust, or the running installation. The private key is imported only into a
temporary keychain; a native test verifies that changed app contents retain the same
certificate-bound designated requirement.[^local-signing-implementation][^local-signing-test]

[^local-signing-policy]: Private macOS signing policy and one-time privacy-grant migration.

[^local-signing-implementation]: Local signing helper and its cleanup boundary.

[^local-signing-test]: Real codesign verification across two different app builds.
