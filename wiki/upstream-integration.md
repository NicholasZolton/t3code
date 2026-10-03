---
type: Integration Record
title: Upstream integration
description: Completed upstream integration boundaries, latest review, and fork compatibility exceptions.
tags: [upstream, fork, integration]
status: stable
generated:
  by: codex/gpt-6.1-sol
  at: 2026-10-03T19:32:02Z
verified:
  - by: codex/gpt-6.1-sol
    at: 2026-10-03T19:32:02Z
snapshot:
  at: 2026-10-03T19:32:02Z
  fork_main: 0a5b85436bc8fcd26b2ddb126b8c6e6c5818f190
  upstream_main: 65731f986ba2175063b0182deb6a143f8f323b74
  shared_baseline: 99e08526e5ec84f294940cba5929841518c52fec
  last_main_integration: 24d2e49fd91aa8779992b187a3d3395a51de9138
  branch_integration: 696fd65db117198476ad840ca41c4af031b086c4
sources:
  - id: current-integration-candidate
    resource: "Local Git object 696fd65db117198476ad840ca41c4af031b086c4 on NicholasZolton/review-upstream-changes-2; parents 0a5b85436bc8fcd26b2ddb126b8c6e6c5818f190 and 65731f986ba2175063b0182deb6a143f8f323b74; zero ancestry gap against the pinned upstream tip; not yet in fork main"
    title: Full V2 integration candidate with preserved upstream ancestry
  - id: reviewed-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/0a5b85436bc8fcd26b2ddb126b8c6e6c5818f190
    title: Fork main at the October 3 review
  - id: reviewed-upstream-main
    resource: https://github.com/pingdotgg/t3code/commit/65731f986ba2175063b0182deb6a143f8f323b74
    title: Upstream main at the October 3 review
  - id: latest-review-git
    resource: "Local Git review at 2026-10-03T17:37:58Z: fork 0a5b85436bc8fcd26b2ddb126b8c6e6c5818f190; upstream 65731f986ba2175063b0182deb6a143f8f323b74; merge base 99e08526e5ec84f294940cba5929841518c52fec; 60 missing upstream commits; git merge-tree reports 105 unmerged paths; 21 independent patches apply cleanly in a cumulative simulation"
    title: Verified unmerged review boundary and textual merge feasibility
  - id: upstream-v2
    resource: https://github.com/pingdotgg/t3code/commit/de343914273eceb852a1d1d739cd1d38df7796ee
    title: Upstream orchestrator V2 cutover
  - id: upstream-v1-cutover
    resource: https://github.com/pingdotgg/t3code/blob/65731f986ba2175063b0182deb6a143f8f323b74/apps/server/src/orchestration-v2/legacy/LegacyV1Cutover.integration.test.ts
    title: Messages-only legacy import and fresh-session continuation
  - id: upstream-protocol
    resource: https://github.com/pingdotgg/t3code/blob/65731f986ba2175063b0182deb6a143f8f323b74/packages/contracts/src/environment.ts
    title: Orchestration wire protocol version 2
  - id: upstream-current-manifest
    resource: https://github.com/pingdotgg/t3code/blob/65731f986ba2175063b0182deb6a143f8f323b74/apps/server/src/provider/model-manifest.json
    title: OpenCode version policy at the reviewed upstream tip
  - id: main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/27
    title: Completed full upstream integration into fork main
  - id: integration-commit
    resource: https://github.com/NicholasZolton/t3code/commit/24d2e49fd91aa8779992b187a3d3395a51de9138
    title: Upstream merge with preserved fork behavior
  - id: fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/60e0650513868e092b20dde6bfcf3e27fa719180
    title: Fork main after PR 27 merged
  - id: upstream-main
    resource: https://github.com/pingdotgg/t3code/commit/99e08526e5ec84f294940cba5929841518c52fec
    title: Reviewed upstream main
  - id: previous-integration
    resource: https://github.com/NicholasZolton/t3code/commit/bd57816184c5b0e2db6110310c3655857eb817f1
    title: Previous completed integration through 6530de0339
  - id: previous-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/21
    title: Previous full upstream integration through 0fcd5f9061
  - id: native-v2-integration
    resource: https://github.com/NicholasZolton/t3code/commit/2ee019f626ca133fa2678ab2a16fa770afe9d351
    title: Earlier native OpenCode v2 integration
  - id: unmerged-candidate
    resource: "Local Git object a8df093eb69c1c6bc5f923e46b77f0a2d5f498b1 on NicholasZolton/audit-fork-upstream-differences"
    title: Earlier unmerged integration candidate
  - id: git-history
    resource: "Local Git inspection: fork main 60e0650513868e092b20dde6bfcf3e27fa719180 incorporates merge 24d2e49fd91aa8779992b187a3d3395a51de9138 and all 50 commits through upstream 99e08526e5ec84f294940cba5929841518c52fec; remaining ancestry gap is zero"
    title: Verified completed main integration boundary
  - id: ssh-deployment
    resource: ../scripts/deploy-ssh-runtime.sh
    title: Fork SSH runtime deployment and release handoff
  - id: upstream-jujutsu
    resource: https://github.com/pingdotgg/t3code/pull/13816
    title: Upstream Jujutsu support selectively ported into the fork
  - id: fork-jujutsu
    resource: https://github.com/NicholasZolton/t3code/commit/10f6b88380011b466e0be0355b76874e41db43a2
    title: Fork Jujutsu port with durable mixed-backend workspace recovery
---

# Upstream integration

**Latest review: fork `main` at `0a5b85436b` is 60 commits behind
upstream `65731f986b`. No integration from this reviewed range has
landed.** The shared baseline remains `99e08526e5`; the last completed
sync is still PR #27.[^latest-review-git]

**Fork `main` includes all reviewed upstream history through `99e08526e5`,
with zero remaining ancestry gap against that tip.**
[PR #27](https://github.com/NicholasZolton/t3code/pull/27) merged at October 2,
2026, 06:32:19 UTC (October 1 in Pacific time), bringing all 50 reviewed
upstream commits into `main` at `60e0650513`.[^main-integration][^git-history]

This is a revision-pinned snapshot, not a claim about newer upstream work.
Refresh it after the next review or integration using the
[maintenance guidance](maintenance.md).

## October 3 integration candidate

Merge `696fd65db117198476ad840ca41c4af031b086c4` on
`NicholasZolton/review-upstream-changes-2` integrates all 60 reviewed commits through `65731f986ba2175063b0182deb6a143f8f323b74`, preserving upstream
ancestry. It uses upstream orchestrator V2, the native OpenCode 2 adapter, and the
new thread/project MCP tools. Fork `main` at `0a5b85436b` still awaits this
integration; the last completed main sync remains PR #27. The branch has zero
remaining ancestry gap against the pinned upstream tip.[^current-integration-candidate][^reviewed-fork-main]

The maintainer chose upstream's legacy import: old messages and metadata survive,
but pre-upgrade checkpoints, tool history, and native sessions do not. First
continuation starts a fresh provider session with bounded handoff context. Rewind
and edit-with-files-kept apply to new V2 turns. Protocol 2 requires matching web,
desktop, mobile, and server versions; coordinate the SSH server restart with active
remote turns.[^upstream-v1-cutover][^upstream-protocol]

Retained fork behavior includes provider-configured OpenCode permissions, model
defaults, account switching and quota weights, none/project/environment agent
thread access, reusable prompts, Vim, mixed Git/Jujutsu recovery and checkpoints,
Crit/Portless, phone pairing identity, and SSH release handoff. Upstream now owns
native OpenCode 2 and thread management; removed V1 adapters and the old plural
thread toolkit are replaced by those upstream services. The legacy worktree prefix
migrates to upstream branch naming while preserving temporary branch names. No
live database or remote server was changed while preparing this candidate.

## Latest completed upstream sync

`24d2e49fd9` has parents fork `b469d18b16` and upstream `99e08526e5`.
Both parents are incorporated into fork `main`. The
[integrated range](https://github.com/pingdotgg/t3code/compare/0fcd5f90611451cca842689faea53b5450c022da...99e08526e5ec84f294940cba5929841518c52fec)
includes GitHub polling reductions, Claude lifecycle fixes, desktop preview
fixes, composer undo grouping, provider maintenance across environments,
projectless threads, named projects, the Working sidebar, and Expo SDK 58 /
React Native 0.88 migration.[^integration-commit][^upstream-main]

Default to upstream implementations. Retain fork code for explicit features
or fixes upstream does not provide. This sync combines upstream fresh catalog
rescans and race protection with the fork's automatic catalog freshness and
invalidation, and routes Scratch preparation through the existing shared
[V1 thread dispatcher](https://github.com/NicholasZolton/t3code/blob/24d2e49fd91aa8779992b187a3d3395a51de9138/apps/server/src/orchestration/ThreadCommandDispatcher.ts)
used by WebSocket and MCP. Native OpenCode v2, saved prompts, Vim clipboard
undo, and mixed Git/Jujutsu recovery remain fork exceptions.[^integration-commit]

## Last completed integration

| Item                                               | Recorded value                                                  |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Fork                                               | `NicholasZolton/t3code`, remote `origin`                        |
| Upstream                                           | `pingdotgg/t3code`, remote `upstream`                           |
| Main landing commit                                | `60e0650513` — merge of PR #27                                  |
| Upstream integration commit                        | `24d2e49fd9` — `chore(sync): merge upstream through 99e08526e5` |
| Fork-side parent                                   | `b469d18b16`                                                    |
| Upstream-side parent / shared baseline             | `99e08526e5`                                                    |
| Missing commits at that integration's upstream tip | **0**                                                           |

The integration preserves native OpenCode v2, account switching and quota
weighting, reusable prompts, Vim editing, rewind behavior, and SSH/Portless
and Crit integrations. Both merge parents remain in fork main's ancestry;
the sync was not squashed.[^integration-commit][^fork-main][^git-history]

![Completed upstream integration into fork main](assets/upstream-integration.svg)

[Mermaid source](assets/upstream-integration.mmd)

## Earlier integration boundaries

[PR #21](https://github.com/NicholasZolton/t3code/pull/21) merged at September 30,
2026, 05:57:39 UTC (September 29 in Pacific time), bringing the 81 previously
missing upstream commits through `0fcd5f9061` into `main` at `3da3d19cc2`.
Its upstream merge was `d8353ce56e`.[^previous-main-integration]

The September 25, 2026 sync was `bd57816184`, completed at
19:39:18 −07:00, through upstream `6530de0339`. Earlier that day,
`2ee019f626` integrated native OpenCode v2 on upstream `7a12aff471`; the later
sync added 18 upstream commits.[^previous-integration][^native-v2-integration]

The September 27 candidate `a8df093eb6`, with parents fork `af25cb3127` and
upstream `d15210cd3d`, never reached main. It covered 53 of the 81 commits
subsequently included by PR #21. The other 28 were newer than that candidate.
Do not treat the candidate as a completed integration.[^unmerged-candidate][^git-history]

The [integrated range](https://github.com/pingdotgg/t3code/compare/6530de0339d2ca49957d0039133c49e3a08557f7...0fcd5f90611451cca842689faea53b5450c022da)
includes performance and provider lifecycle fixes, background queued-message
sending, mobile improvements, managed ChatGPT/Codex authentication, Codex 0.159
bindings, Sonnet 5.5 metadata, Bitbucket credentials, keyboard latency work,
OpenCode Go account deduplication, and releases 0.0.43 and 0.0.44.

## OpenCode compatibility boundary

At the completed `99e08526e5` sync, upstream marked OpenCode v2
incompatible while this fork supported it natively. Fork #18 removed that
advisory, and PR #27 retained the bundled policy and remote metadata filter.
That protection still matters at the newly reviewed tip.[^main-integration][^integration-commit]

Upstream `65731f986b` supplies the native OpenCode 2 implementation, tested
against 2.0.18. This candidate adopts its 2.0.18+ baseline, including the installed
2.0.22 CLI, and removes the obsolete fork V2 adapter. The bundled policy enables
that baseline starting at this fork's package version 0.0.45, rather than waiting
for upstream's 0.0.46 threshold. Remote compatibility metadata still cannot replace
the bundled OpenCode policy. Older 2.x versions are outside the supported baseline.
[^upstream-current-manifest][^reviewed-upstream-main]

## Jujutsu migration boundary

The fork selectively ports [upstream #13816](https://github.com/pingdotgg/t3code/pull/13816)
with additional recovery safeguards. New isolated threads inherit the project's backend;
existing Git worktrees remain Git, including after cleanup and recreation. Ownership is
recorded in shared Git config rather than a new thread field. A colocated main checkout
and Jujutsu 0.42.0 or newer are required on each server host.[^upstream-jujutsu][^fork-jujutsu]

Preserve this mixed-backend boundary during future syncs. The
[architecture notes](../docs/internals/jujutsu.md) explain checkpoint preservation and
explicit ref synchronization; the [user guide](../docs/user/source-control.md#jujutsu-repositories)
covers enabling Jujutsu and disabling VCS agent hints globally or per project.

## SSH runtime release handoff

The [SSH deployment helper](../scripts/deploy-ssh-runtime.sh) accepts an optional
previous runtime version, for example `bash scripts/deploy-ssh-runtime.sh
<host> <project-directory> 0.0.42` when installing 0.0.44. It updates only the
managed launcher whose process uses that exact installed runtime, preserves
the previous archive, and restores the launcher if startup fails. Coordinate
the restart with active remote turns.[^ssh-deployment]

## Rechecking the boundary

After fetching `origin main` and `upstream main`, use ancestry to identify the
active baseline and gap. `--is-ancestor` exits 0 when incorporated and 1 when
absent.

```bash
git rev-parse origin/main upstream/main
git merge-base origin/main upstream/main
git merge-base --is-ancestor 24d2e49fd9 origin/main
git merge-base --is-ancestor a8df093eb6 origin/main
git rev-list --count origin/main..upstream/main
git log --reverse --oneline origin/main..upstream/main
```

[^main-integration]: PR #27 and its recorded merge time and verification.

[^integration-commit]: Full upstream merge, its parents, and preserved fork behavior.

[^fork-main]: PR landing commit retaining upstream ancestry.

[^upstream-main]: Exact reviewed upstream revision.

[^previous-integration]: Previous completed sync through upstream 6530de0339.

[^previous-main-integration]: PR #21 and its completed integration through upstream 0fcd5f9061.

[^native-v2-integration]: Earlier native OpenCode v2 integration.

[^unmerged-candidate]: Local-only candidate and its parents; not an ancestor of main.

[^git-history]: Ancestry checks and commit counts against the pinned revisions.

[^ssh-deployment]: Deployment helper's release handoff and startup rollback.

[^upstream-jujutsu]: Original upstream support, used as the selective-port source.

[^fork-jujutsu]: Durable backend ownership, recovery behavior, and supported Jujutsu baseline.

[^reviewed-fork-main]: Exact fork main revision fetched for this review.

[^reviewed-upstream-main]: Exact upstream main revision fetched for this review.

[^latest-review-git]: Pinned ancestry, commit counts, and merge-tree simulations; no integration landed.

[^upstream-v2]: V2 replacement and the new provider/orchestration boundaries.

[^upstream-v1-cutover]: Legacy import intentionally excludes checkpoints, tool items, and native sessions; continuation uses bounded context in a new session.

[^upstream-protocol]: Protocol version 2 and client/server negotiation metadata.

[^upstream-current-manifest]: Version-scoped OpenCode advisory at the reviewed tip.

[^current-integration-candidate]: Verified merge parents and ancestry on the local integration branch; fork main has not incorporated the candidate.
