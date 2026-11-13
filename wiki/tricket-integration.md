---
type: Decision
title: Native Tricket integration boundary
description: Keep the fork's Tricket coordination outside upstream orchestration and provider code.
status: proposed
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-11-13T20:30:00Z
sources:
  - id: integration
    resource: ../apps/server/src/integrations/tricket/TricketIntegration.ts
    title: Native integration implementation on the unmerged Tricket feature change
  - id: usage
    resource: ../docs/user/tricket.md
    title: Tricket setup and assignment behavior
---

# Native Tricket integration boundary

This feature change is not a live deployment. Tricket-specific coordination lives
under `apps/server/src/integrations/tricket`; shared edits register the service,
transports, contracts, capability, and settings page. Keep provider adapters and the
core orchestrator free of Tricket branches when merging upstream.[^integration]

Tricket owns assignment and review policy. The selected T3 environment owns
execution, including credentials and repositories. A client selecting another
environment must not move that execution to its own machine. An ended provider turn
is not ticket completion.[^usage]

The connector owns a separate SQLite database under the environment's state directory,
not a numbered upstream migration. Back up that state together with the environment's
secret store: durable handoff identities and stable launch commands prevent duplicate
work after a restart. Do not replace these with prompt-level coordination or
administrator credentials passed to agents.[^integration]

[^integration]: [Native coordinator](../apps/server/src/integrations/tricket/TricketIntegration.ts) and [repository](../apps/server/src/integrations/tricket/TricketRepository.ts), unmerged feature implementation.

[^usage]: [Tricket assignments](../docs/user/tricket.md).
