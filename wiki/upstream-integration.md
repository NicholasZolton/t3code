---
type: Integration Record
title: Upstream integration
description: Completed upstream integration boundaries, latest review, and fork compatibility exceptions.
tags: [upstream, fork, integration]
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-10-07T15:01:49Z
verified:
  - by: opencode/gpt-6.1-sol
    at: 2026-10-05T20:00:49Z
snapshot:
  at: 2026-10-05T20:00:49Z
  fork_main: 258680014485a577ecb2f07829caf432b874d3ea
  upstream_main: 1604ccc9d79f5270fb8e14d60664184bf142c4cb
  shared_baseline: 1604ccc9d79f5270fb8e14d60664184bf142c4cb
  last_main_integration: ab7e864a1aa3ce44d99454b8e363297227475ead
sources:
  - id: october-5-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/34
    title: Completed October 5 full upstream integration into fork main
  - id: october-5-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/258680014485a577ecb2f07829caf432b874d3ea
    title: Fork main after PR 34 merged with upstream ancestry preserved
  - id: october-5-candidate
    resource: https://github.com/NicholasZolton/t3code/commit/ab7e864a1aa3ce44d99454b8e363297227475ead
    title: Full upstream merge through October 5, now incorporated into main
  - id: october-5-candidate-decisions
    resource: "Integrated tree at ab7e864a1aa3ce44d99454b8e363297227475ead: MCP directory and restored OpenCode helper tests match upstream 1604ccc9d79f5270fb8e14d60664184bf142c4cb; custom agent thread access policy and settings removed; workspace freshness and invalidation combined with incomplete-discovery retries"
    title: Verified upstream-first conflict resolutions
  - id: upstream-mcp-targeting
    resource: https://github.com/pingdotgg/t3code/commit/06e627448b
    title: Upstream explicit MCP targets, external callers, and permission ceilings
  - id: current-integration
    resource: https://github.com/NicholasZolton/t3code/commit/696fd65db117198476ad840ca41c4af031b086c4
    title: Completed V2 integration with preserved upstream ancestry
  - id: current-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/32
    title: Completed October 3 full upstream integration into fork main
  - id: current-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/a9b81ef5c5017cc8268a7ca408ddb8430cc370c5
    title: Fork main after PR 32 merged
  - id: current-git-history
    resource: "Local Git verification: fork main a9b81ef5c5017cc8268a7ca408ddb8430cc370c5 contains integration 696fd65db117198476ad840ca41c4af031b086c4 and upstream 65731f986ba2175063b0182deb6a143f8f323b74; merge base is the pinned upstream tip and the remaining ancestry gap is zero"
    title: Verified completed V2 integration boundary
  - id: reviewed-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/75c7b1b95c9df64a239c6ffa06ef1e7a694008a0
    title: Fork main at the October 5 integration verification
  - id: reviewed-upstream-main
    resource: https://github.com/pingdotgg/t3code/commit/1604ccc9d79f5270fb8e14d60664184bf142c4cb
    title: Upstream main at the October 5 review
  - id: latest-review-git
    resource: "Local Git verification at 2026-10-05T20:00:49Z: fork main 258680014485a577ecb2f07829caf432b874d3ea contains integration ab7e864a1aa3ce44d99454b8e363297227475ead and upstream 1604ccc9d79f5270fb8e14d60664184bf142c4cb; merge base is the pinned upstream tip; zero missing upstream commits on main; PR 34 merged at 2026-10-05T20:00:02Z"
    title: Verified completed October 5 integration boundary
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
    resource: https://github.com/pingdotgg/t3code/blob/1604ccc9d79f5270fb8e14d60664184bf142c4cb/apps/server/src/provider/model-manifest.json
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
  - id: remote-deployment-checks
    resource: ../AGENTS.md#remote-deployment-checks
    title: Persistent tailnet publication and remote deployment verification
  - id: tailscale-persistence
    resource: ../apps/server/src/cli/pair.ts
    title: Pairing with the running server and remembering Tailscale Serve settings
  - id: ssh-recovery
    resource: ../packages/ssh/src/tunnel.ts
    title: Fork-side SSH recovery implementation, checked 2026-10-06T03:40:07Z
  - id: upstream-ssh-recovery
    resource: https://github.com/pingdotgg/t3code/blob/3a9c1a6df1b71d8ba73d287be90443e8e874802f/packages/ssh/src/tunnel.ts
    title: Upstream still stops servers during stale-tunnel cleanup and failed reuse probes at the October 6 SSH review
  - id: ssh-recovery-issue
    resource: https://github.com/pingdotgg/t3code/issues/15608
    title: Upstream report of remote work stopping on disconnect and stale-tunnel recovery
  - id: upstream-jujutsu
    resource: https://github.com/pingdotgg/t3code/pull/13816
    title: Upstream Jujutsu support selectively ported into the fork
  - id: fork-jujutsu
    resource: https://github.com/NicholasZolton/t3code/commit/10f6b88380011b466e0be0355b76874e41db43a2
    title: Fork Jujutsu port with durable mixed-backend workspace recovery
  - id: private-android-signing
    resource: ../docs/operations/android-notifications.md#private-fork-apk-signing
    title: Private fork APK signing with the repository's fnox local profile
---

# Upstream integration

**Fork `main` includes all 114 newer upstream commits through `1604ccc9d7`,
with zero gap against that pinned tip.**
[PR #34](https://github.com/NicholasZolton/t3code/pull/34) merged on October 5,
2026, at 20:00:02 UTC, landing at `2586800144`. The shared baseline is now
`1604ccc9d7`.[^october-5-main-integration][^latest-review-git]

This is a revision-pinned snapshot, not a claim about newer upstream work.
Refresh it after the next review or integration using the
[maintenance guidance](maintenance.md).

## Latest completed upstream sync

Merge `ab7e864a1aa3ce44d99454b8e363297227475ead` preserves upstream ancestry,
with fork parent `9064bb3d8e` and upstream parent `1604ccc9d7`. The branch also
incorporates fork `main`'s docs-only remote-deployment update. Both parents are
incorporated into fork `main`; the sync was not squashed.
[^october-5-candidate][^october-5-fork-main][^latest-review-git]

The maintainer chose upstream's MCP implementation in full: explicit targets,
external callers, cross-project access, and caller permission ceilings replace
the fork's none/project/environment access policy and its settings. Future syncs
should not restore that parallel policy. Command discovery keeps the fork's
catalog freshness and invalidation while adopting upstream's incomplete-discovery
detection and retries on web, desktop, and mobile. Upstream OpenCode parser and
permission helper tests replace the overlapping fork-only attachment test.
[^upstream-mcp-targeting][^october-5-candidate-decisions]

Unrelated fork behavior remains: Jujutsu, reusable prompts, Vim, configured
OpenCode permissions, accounts and defaults, quota weights, Crit/Portless,
worktree configuration, and remembered Tailscale publication. The OpenCode
compatibility exception below remains necessary; the Jujutsu source PR is still
closed without merging into upstream `main`.[^october-5-candidate-decisions][^upstream-jujutsu]

## V2 history and protocol boundary

Merge `696fd65db117198476ad840ca41c4af031b086c4` has parents fork
`0a5b85436bc8fcd26b2ddb126b8c6e6c5818f190` and upstream
`65731f986ba2175063b0182deb6a143f8f323b74`. Both parents are incorporated into
fork `main`; the sync was not squashed. It adopts upstream orchestrator V2,
native OpenCode 2, and the new thread/project MCP services.
[^current-integration][^current-fork-main]

The maintainer chose upstream's legacy import: old messages and metadata survive,
but pre-upgrade checkpoints, tool history, and native sessions do not. First
continuation starts a fresh provider session with bounded handoff context. Rewind
and edit-with-files-kept apply to new V2 turns. Protocol 2 requires matching web,
desktop, mobile, and server versions; coordinate the SSH server restart with active
remote turns.[^upstream-v1-cutover][^upstream-protocol]

That sync retained provider-configured OpenCode permissions, model
defaults, account switching and quota weights, reusable prompts, Vim, mixed
Git/Jujutsu recovery and checkpoints, Crit/Portless, phone pairing identity, and
SSH release handoff. Upstream now owns
native OpenCode 2 and thread management; removed V1 adapters and the old plural
thread toolkit are replaced by those upstream services. The legacy worktree prefix
migrates to upstream branch naming while preserving temporary branch names. The integration was verified against isolated state.

## Last completed integration

| Item                                               | Recorded value                                                  |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Fork                                               | `NicholasZolton/t3code`, remote `origin`                        |
| Upstream                                           | `pingdotgg/t3code`, remote `upstream`                           |
| Main landing commit                                | `2586800144` — merge of PR #34                                  |
| Upstream integration commit                        | `ab7e864a1a` — `chore(sync): merge upstream through 1604ccc9d7` |
| Fork-side parent                                   | `9064bb3d8e`                                                    |
| Upstream-side parent / shared baseline             | `1604ccc9d7`                                                    |
| Missing commits at that integration's upstream tip | **0**                                                           |

Default to upstream implementations. Retain fork code for explicit features
or fixes upstream does not provide. Native OpenCode 2 and thread management now
use upstream services; fork configuration and UI improvements remain layered on
those paths.[^october-5-candidate]

## Earlier integration boundaries

[PR #32](https://github.com/NicholasZolton/t3code/pull/32) merged on October 3,
2026, at 19:59:31 UTC, bringing all 60 reviewed commits through `65731f986b`
into fork `main` at `a9b81ef5c5`, with zero gap against that older tip.
[^current-main-integration][^current-git-history]

[PR #27](https://github.com/NicholasZolton/t3code/pull/27) merged on October 2,
2026, at 06:32:19 UTC, bringing all 50 reviewed commits through `99e08526e5`
into fork `main` at `60e0650513`. Its upstream merge was `24d2e49fd9`.
[^main-integration][^integration-commit][^git-history]

![Previous PR 27 integration boundary](assets/upstream-integration.svg)

[Historical Mermaid source](assets/upstream-integration.mmd)

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
against 2.0.18. The completed integration adopts its 2.0.18+ baseline, including the installed
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
the restart with active remote turns. Its readiness check covers loopback only,
not the phone-facing Tailscale endpoint.[^ssh-deployment]

Tailnet publication must be remembered in the running server's state directory
so restarts restore forwarding to its actual listener. A standalone Tailscale
Serve mapping is not sufficient. Follow the [remote deployment checks](../AGENTS.md#remote-deployment-checks)
and require the original HTTPS endpoint to return the same environment ID after
deployment or rollback.[^remote-deployment-checks][^tailscale-persistence]

## SSH recovery exception

Fork-side SSH recovery separates stale-tunnel cleanup from remote shutdown and
preserves an existing server's ownership when readiness times out, rather than
killing it or launching a competing server against the same T3 home. Explicit
Disconnect, desktop shutdown, and requested runner changes retain their existing
behavior.[^ssh-recovery]

At the focused October 6 review, upstream `3a9c1a6df1` still has both destructive
recovery paths; issue #15608 remains open. Preserve this boundary during later syncs
unless upstream supplies equivalent recovery behavior.[^upstream-ssh-recovery][^ssh-recovery-issue]

## Private Android signing identity

Installable private fork APKs use one persistent signing key, stored age-encrypted
in the repository's fnox `local` profile. Preserve that key during future syncs;
replacing it or shipping a debug-signed APK prevents in-place updates to existing
private installations. The user-level age identity remains outside the repository,
and official/EAS signing stays unchanged. See the [signing procedure](../docs/operations/android-notifications.md#private-fork-apk-signing).
[^private-android-signing]

## Rechecking the boundary

After fetching `origin main` and `upstream main`, use ancestry to identify the
active baseline and gap. `--is-ancestor` exits 0 when incorporated and 1 when
absent.

```bash
git rev-parse origin/main upstream/main
git merge-base origin/main upstream/main
git merge-base --is-ancestor 696fd65db1 origin/main
git merge-base --is-ancestor ab7e864a1a origin/main
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

[^remote-deployment-checks]: Agent instructions for preserving and verifying the phone-facing endpoint.

[^tailscale-persistence]: `pair --tailscale` discovers the live server and remembers its HTTPS port for startup restoration.

[^ssh-recovery]: Fork-side SSH implementation and its focused readiness-recovery regressions.

[^upstream-ssh-recovery]: Exact upstream source reviewed on October 6.

[^ssh-recovery-issue]: Open upstream issue and its stale-tunnel reconnect reproduction.

[^upstream-jujutsu]: Original upstream support, used as the selective-port source.

[^fork-jujutsu]: Durable backend ownership, recovery behavior, and supported Jujutsu baseline.

[^private-android-signing]: Fork signing policy and the fnox-backed APK signing helper.

[^reviewed-fork-main]: Exact fork main revision fetched for this review.

[^reviewed-upstream-main]: Exact upstream main revision fetched for this review.

[^latest-review-git]: October 5 completed main ancestry checks, merge time, and zero missing commits against the pinned upstream tip.

[^october-5-main-integration]: PR #34 and its recorded merge time.

[^october-5-fork-main]: Main landing commit retaining the complete upstream ancestry.

[^october-5-candidate]: Full upstream merge with fork parent 9064bb3d8e and upstream parent 1604ccc9d7, now incorporated into main.

[^october-5-candidate-decisions]: Source comparison of the candidate's conflict resolutions and retained fork features.

[^upstream-mcp-targeting]: Upstream MCP caller/target redesign selected instead of the fork access policy.

[^upstream-v2]: V2 replacement and the new provider/orchestration boundaries.

[^upstream-v1-cutover]: Legacy import intentionally excludes checkpoints, tool items, and native sessions; continuation uses bounded context in a new session.

[^upstream-protocol]: Protocol version 2 and client/server negotiation metadata.

[^upstream-current-manifest]: Version-scoped OpenCode advisory at the reviewed tip.

[^current-integration]: Full V2 upstream merge and its fork and upstream parents.

[^current-main-integration]: PR #32 and its recorded merge time.

[^current-fork-main]: Main landing commit retaining upstream ancestry.

[^current-git-history]: Ancestry checks and zero missing commits against the pinned upstream tip.
