---
type: Integration Record
title: Upstream integration
description: Completed main integration, the current branch's full upstream merge, and the gap still awaiting main.
tags: [upstream, fork, integration]
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-09-30T05:44:39Z
verified:
  - by: opencode/gpt-6.1-sol
    at: 2026-09-30T05:44:39Z
snapshot:
  at: 2026-09-30T05:44:39Z
  fork_main: dfd23dbec7bfe9f06d2f7e9583fda857f5b7b02f
  upstream_main: 0fcd5f90611451cca842689faea53b5450c022da
  shared_baseline: 6530de0339d2ca49957d0039133c49e3a08557f7
  last_main_integration: bd57816184c5b0e2db6110310c3655857eb817f1
  unmerged_candidate: a8df093eb69c1c6bc5f923e46b77f0a2d5f498b1
  current_branch_integration: d8353ce56ec9a72b3ef8be931dffb3bc6401469a
sources:
  - id: main-integration
    resource: https://github.com/NicholasZolton/t3code/commit/bd57816184c5b0e2db6110310c3655857eb817f1
    title: Last upstream integration incorporated into fork main
  - id: native-v2-integration
    resource: https://github.com/NicholasZolton/t3code/commit/2ee019f626ca133fa2678ab2a16fa770afe9d351
    title: Earlier native OpenCode v2 integration
  - id: fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/dfd23dbec7bfe9f06d2f7e9583fda857f5b7b02f
    title: Fork main at the snapshot
  - id: upstream-main
    resource: https://github.com/pingdotgg/t3code/commit/0fcd5f90611451cca842689faea53b5450c022da
    title: Upstream main at the snapshot
  - id: unmerged-candidate
    resource: "Local Git object a8df093eb69c1c6bc5f923e46b77f0a2d5f498b1 on NicholasZolton/audit-fork-upstream-differences"
    title: Unmerged upstream integration candidate and its parents
  - id: git-history
    resource: "Ancestry and commit ranges against fetched origin/main, upstream/main, and local integration d8353ce56ec9a72b3ef8be931dffb3bc6401469a, checked at 2026-09-30T05:44:39Z"
    title: Git ancestry and commit-count inspection
  - id: current-branch-integration
    resource: "Local Git object d8353ce56ec9a72b3ef8be931dffb3bc6401469a on NicholasZolton/review-upstream-changes"
    title: Full upstream merge awaiting integration into fork main
  - id: ssh-deployment
    resource: ../scripts/deploy-ssh-runtime.sh
    title: Fork SSH runtime deployment and release handoff
---

# Upstream integration

**The last upstream integration that reached fork `main` was September 25,
2026 at 19:39:18 −07:00** (September 26 at 02:39:18 UTC). The September 27
integration candidate did not reach `main`. **The current branch now includes
all 81 missing upstream commits**, through `0fcd5f9061`, in merge `d8353ce56e`.
That merge has not reached fork `main`, where the 81-commit gap still exists.[^main-integration][^git-history][^current-branch-integration]

This is a revision-pinned snapshot, observed September 30, 2026 at 05:44:39 UTC
(September 29 in Pacific time). Refresh it after the next upstream review or
integration using the [maintenance guidance](maintenance.md).

## Last completed integration

| Item                                   | Recorded value                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Fork                                   | `NicholasZolton/t3code`, remote `origin`                                                |
| Upstream                               | `pingdotgg/t3code`, remote `upstream`                                                   |
| Integration commit                     | `bd57816184` — `chore(sync): merge fork main`                                           |
| Fork-side parent                       | `660e808979`                                                                            |
| Upstream-side parent / shared baseline | `6530de0339`                                                                            |
| Last included upstream change          | `perf(server): pull request sync reads only threads with linked pull requests (#13704)` |
| Reviewed fork main                     | `dfd23dbec7`                                                                            |
| Reviewed upstream main                 | `0fcd5f9061`                                                                            |

Although the merge subject says “merge fork main,” its second parent is upstream
`6530de0339`. The commit is an ancestor of the reviewed fork `main`, and the
merge base of the two reviewed main branches is still `6530de0339`.
Those relationships establish the completed sync boundary.[^main-integration][^git-history]

Earlier that day, `2ee019f626` integrated native OpenCode v2 work on top of
upstream `7a12aff471`. The later `bd57816184` merge brought in **18 additional
upstream commits**, from `7a12aff471` through `6530de0339`.[^native-v2-integration][^git-history]

Those 18 commits included faster thread-event projection and PR syncing,
unchanged review-file caching, SQLite WAL shrinking, idle-terminal cleanup,
lighter mobile Home rows, Cursor keyring and pricing fixes, standard OTLP
configuration, and CLI trace/triage improvements. See the
[exact integrated range](https://github.com/pingdotgg/t3code/compare/7a12aff471ffe2b22b9fee495b04b32c43f45a37...6530de0339d2ca49957d0039133c49e3a08557f7).

The first fork-only work descends from upstream `b2b43bef73` on September 24.
Between that original divergence point and the reviewed upstream tip are **158
upstream commits: 77 incorporated, 81 missing**. This describes Git ancestry,
not the GitHub repository's creation date.[^git-history]

## Current branch integration

`d8353ce56e` merges upstream `0fcd5f9061` into the fork based on main
`dfd23dbec7`, after wiki initialization `3182e44df5`. It preserves the native
OpenCode v2 adapter and compatibility policy, account switching and quota
weighting, reusable prompts, Vim editing, rewind behavior, and SSH/Portless
and Crit integrations. The merge is local on
`NicholasZolton/review-upstream-changes`; the upstream ancestry gap on that
branch is **zero**. Advance the completed-main boundary only once this merge
reaches fork `main`.[^current-branch-integration][^git-history]

## The gap still awaiting main

![Completed main baseline, earlier candidate, and current full branch integration](assets/upstream-integration.svg)

[Mermaid source](assets/upstream-integration.mmd)

| Upstream range                       | Commits missing from fork main | Integration status                                             |
| ------------------------------------ | -----------------------------: | -------------------------------------------------------------- |
| `6530de0339..d15210cd3d`             |                         **53** | Covered by earlier candidate `a8df093eb6` and current merge    |
| `d15210cd3d..0fcd5f9061`             |                         **28** | Included in current branch merge, newer than earlier candidate |
| Entire gap: `6530de0339..0fcd5f9061` |                         **81** | Included in current branch merge `d8353ce56e`; awaiting main   |

The candidate `a8df093eb6` was created September 27, 2026 at 20:51:45 −07:00
(September 28 at 03:51:45 UTC). Its parents are fork `af25cb3127` and upstream
`d15210cd3d`. It is **not an ancestor of fork `main`**. The reviewed main also
has 15 commits absent from that candidate, so it is not a current replacement
for main.[^unmerged-candidate][^git-history]

The first 53 missing commits include server/query/cache performance work,
background queued-message sending, chat-width and usage-navigation settings,
mobile fixes, and provider lifecycle fixes. The next 28 include managed
ChatGPT/Codex authentication, Codex 0.159 bindings, Sonnet 5.5 metadata,
Bitbucket credentials, keyboard latency improvements, OpenCode Go account
deduplication, and releases 0.0.43 and 0.0.44. The
[full missing range](https://github.com/pingdotgg/t3code/compare/6530de0339d2ca49957d0039133c49e3a08557f7...0fcd5f90611451cca842689faea53b5450c022da)
is the authoritative inventory.

## Compatibility exception to retain

Upstream at `0fcd5f9061` still marks OpenCode v2 incompatible, following
[#14198](https://github.com/pingdotgg/t3code/pull/14198). This fork has native v2 integration and deliberately removed
that advisory in [fork #18](https://github.com/NicholasZolton/t3code/pull/18).
Keep that distinction visible during integration; a newer upstream manifest
does not establish incompatibility for this fork. The fork's
[`ModelManifest.ts`](https://github.com/NicholasZolton/t3code/blob/dfd23dbec7bfe9f06d2f7e9583fda857f5b7b02f/apps/server/src/provider/ModelManifest.ts)
also filters the upstream OpenCode advisory from remotely fetched metadata.
The current branch retains both protections while taking upstream's
interrupted-send cleanup and more tolerant readiness-line matching.

## SSH runtime release handoff

The [SSH deployment helper](../scripts/deploy-ssh-runtime.sh) accepts an optional previous runtime version for a
release handoff, for example `bash scripts/deploy-ssh-runtime.sh <host>
<project-directory> 0.0.42` when installing 0.0.44. It updates only the managed
launcher whose process uses that exact installed runtime, preserves the
previous archive, and restores the launcher if startup fails. Coordinate the
restart with active remote turns.[^ssh-deployment]

## Rechecking the boundary

After fetching `origin main` and `upstream main`, these read-only checks identify
the active baseline and gap. `--is-ancestor` exits 0 when incorporated and 1
when absent; use ancestry, not a merge commit's title, as the evidence.

```bash
git rev-parse origin/main upstream/main
git merge-base origin/main upstream/main
git merge-base --is-ancestor bd57816184 origin/main
git merge-base --is-ancestor a8df093eb6 origin/main
git merge-base --is-ancestor d8353ce56e origin/main
git merge-base --is-ancestor upstream/main HEAD
git rev-list --count HEAD..upstream/main
git rev-list --count origin/main..upstream/main
git rev-list --count origin/main..d15210cd3d
git rev-list --count d15210cd3d..upstream/main
git log --reverse --oneline origin/main..upstream/main
```

These observations confirm history and omissions. They do not certify that the
unmerged candidate builds or preserves behavior.

[^main-integration]: Integration commit and its two parent revisions.

[^native-v2-integration]: Earlier integration commit and its upstream parent.

[^git-history]: Local Git ancestry checks and commit counts against the pinned main revisions.

[^unmerged-candidate]: Local-only candidate commit, parents, and reachability from fork main.

[^current-branch-integration]: Local merge commit, its parents, preserved fork code, and reachability from the branch and fork main.

[^ssh-deployment]: The fork's deployment helper, including release handoff and startup rollback.
