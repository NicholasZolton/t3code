---
type: Decision
title: Native Tricket integration boundary
description: Keep the fork's Tricket coordination outside upstream orchestration and provider code.
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-11-14T00:50:00Z
sources:
  - id: integration
    resource: ../apps/server/src/integrations/tricket/TricketIntegration.ts
    title: Native Tricket coordinator
  - id: rollout
    resource: https://github.com/NicholasZolton/t3code/pull/76
    title: Initial integration merged at e417261f4fbdf5a53a7e1087adcb05c56cf54b00
  - id: usage
    resource: ../docs/user/tricket.md
    title: Tricket setup and assignment behavior
---

# Native Tricket integration boundary

The initial integration merged in PR #76 and was deployed to the existing OVH
environment on November 13, 2026, using runtime 0.1.9.[^rollout] Tricket-specific coordination lives
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

External ticket edits and note changes continue the existing owner. Suppress only
that owner's actor ID, not all agent actors. Webhooks wake reconciliation; committed
activity supplies missed changes. Persist each pending message before dispatch and
reuse its command ID after an ambiguous response. Keep automatic messages marked as
notifications so they do not clear a user's snooze. Worker limits count active turns,
not open tickets.[^integration]

Project lead assignment follows the same ownership model: the pool creates a lead
thread; an enrolled agent retains its existing thread. Execute explicit instructions
in the project brief, otherwise wait for the user. Empty briefs do not start a model
turn. Keep enrollment separate from assignments: the on-demand `t3 tricket` CLI uses
the configured local server, never exposes API tokens, and adds no MCP schemas to
ordinary threads. Existing threads retain their workspace and are not stopped merely
because one attached assignment ends.[^usage]

New project/attached assignment records stay outside the legacy ticket-handoff table
so an older runtime cannot misinterpret them and stop unrelated existing work. Member
identities and these records still belong to the connector's separate database; old
managed ticket credentials are reused rather than rotated during enrollment.[^integration]

[^integration]: [Native coordinator](../apps/server/src/integrations/tricket/TricketIntegration.ts) and [repository](../apps/server/src/integrations/tricket/TricketRepository.ts).

[^rollout]: [Merged initial integration](https://github.com/NicholasZolton/t3code/pull/76); deployment observed through the existing environment descriptor and TRI-2's claim → comment → review execution at 23:30 UTC on November 13, 2026. This initial rollout did not include automatic follow-ups.

[^usage]: [Tricket assignments](../docs/user/tricket.md).
