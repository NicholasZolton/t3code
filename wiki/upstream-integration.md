---
type: Integration Record
title: Upstream integration
description: Completed upstream integration into fork main and compatibility exceptions to preserve.
tags: [upstream, fork, integration]
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-09-30T05:57:39Z
verified:
  - by: opencode/gpt-6.1-sol
    at: 2026-09-30T05:57:39Z
snapshot:
  at: 2026-09-30T05:57:39Z
  fork_main: 3da3d19cc2d522afc521fcb99afd3bb1f7a0d209
  upstream_main: 0fcd5f90611451cca842689faea53b5450c022da
  shared_baseline: 0fcd5f90611451cca842689faea53b5450c022da
  last_main_integration: d8353ce56ec9a72b3ef8be931dffb3bc6401469a
  unmerged_candidate: a8df093eb69c1c6bc5f923e46b77f0a2d5f498b1
sources:
  - id: main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/21
    title: Completed full upstream integration into fork main
  - id: integration-commit
    resource: https://github.com/NicholasZolton/t3code/commit/d8353ce56ec9a72b3ef8be931dffb3bc6401469a
    title: Upstream merge with preserved fork behavior
  - id: fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/3da3d19cc2d522afc521fcb99afd3bb1f7a0d209
    title: Fork main after merging PR 21
  - id: upstream-main
    resource: https://github.com/pingdotgg/t3code/commit/0fcd5f90611451cca842689faea53b5450c022da
    title: Reviewed upstream main
  - id: previous-integration
    resource: https://github.com/NicholasZolton/t3code/commit/bd57816184c5b0e2db6110310c3655857eb817f1
    title: Previous completed integration through 6530de0339
  - id: native-v2-integration
    resource: https://github.com/NicholasZolton/t3code/commit/2ee019f626ca133fa2678ab2a16fa770afe9d351
    title: Earlier native OpenCode v2 integration
  - id: unmerged-candidate
    resource: "Local Git object a8df093eb69c1c6bc5f923e46b77f0a2d5f498b1 on NicholasZolton/audit-fork-upstream-differences"
    title: Earlier unmerged integration candidate
  - id: git-history
    resource: "Git ancestry and commit-count inspection against fork 3da3d19cc2d522afc521fcb99afd3bb1f7a0d209 and upstream 0fcd5f90611451cca842689faea53b5450c022da after PR 21 merged"
    title: Verified integration boundary and zero remaining ancestry gap
  - id: ssh-deployment
    resource: ../scripts/deploy-ssh-runtime.sh
    title: Fork SSH runtime deployment and release handoff
---

# Upstream integration

**Fork `main` includes all reviewed upstream history through `0fcd5f9061`.**
[PR #21](https://github.com/NicholasZolton/t3code/pull/21) merged at September 30,
2026, 05:57:39 UTC (September 29 in Pacific time), bringing the 81 previously
missing upstream commits into `main`. The ancestry gap against that reviewed
tip is **zero**.[^main-integration][^git-history]

This is a revision-pinned snapshot, not a claim about newer upstream work.
Refresh it after the next review or integration using the
[maintenance guidance](maintenance.md).

## Last completed integration

| Item                                     | Recorded value                                                  |
| ---------------------------------------- | --------------------------------------------------------------- |
| Fork                                     | `NicholasZolton/t3code`, remote `origin`                        |
| Upstream                                 | `pingdotgg/t3code`, remote `upstream`                           |
| Main landing commit                      | `3da3d19cc2` — merge of PR #21                                  |
| Upstream integration commit              | `d8353ce56e` — `chore(sync): merge upstream through 0fcd5f9061` |
| Fork-side parent                         | `3182e44df5`, based on main `dfd23dbec7`                        |
| Upstream-side parent / shared baseline   | `0fcd5f9061`                                                    |
| Missing commits at reviewed upstream tip | **0**                                                           |

The integration preserves native OpenCode v2, account switching and quota
weighting, reusable prompts, Vim editing, rewind behavior, and SSH/Portless
and Crit integrations. Both merge parents remain in fork main's ancestry;
the sync was not squashed.[^integration-commit][^fork-main][^git-history]

![Completed upstream integration and earlier unmerged candidate](assets/upstream-integration.svg)

[Mermaid source](assets/upstream-integration.mmd)

## Earlier integration boundaries

The previous completed sync was `bd57816184`, September 25, 2026 at
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

## Compatibility exception to retain

Upstream at `0fcd5f9061` still marks OpenCode v2 incompatible, following
[#14198](https://github.com/pingdotgg/t3code/pull/14198). This fork supports v2
natively and removed that advisory in [fork #18](https://github.com/NicholasZolton/t3code/pull/18).
A newer upstream manifest does not establish incompatibility for this fork.
The fork's [`ModelManifest.ts`](https://github.com/NicholasZolton/t3code/blob/3da3d19cc2d522afc521fcb99afd3bb1f7a0d209/apps/server/src/provider/ModelManifest.ts)
also filters the upstream OpenCode advisory from remote metadata. PR #21
retains both protections while taking upstream's interrupted-send cleanup
and more tolerant readiness-line matching.[^main-integration]

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
git merge-base --is-ancestor d8353ce56e origin/main
git merge-base --is-ancestor a8df093eb6 origin/main
git rev-list --count origin/main..upstream/main
git log --reverse --oneline origin/main..upstream/main
```

[^main-integration]: PR #21 and its recorded merge time and verification.

[^integration-commit]: Full upstream merge, its parents, and preserved fork behavior.

[^fork-main]: PR landing commit retaining upstream ancestry.

[^upstream-main]: Exact reviewed upstream revision.

[^previous-integration]: Previous completed sync through upstream 6530de0339.

[^native-v2-integration]: Earlier native OpenCode v2 integration.

[^unmerged-candidate]: Local-only candidate and its parents; not an ancestor of main.

[^git-history]: Ancestry checks and commit counts against the pinned revisions.

[^ssh-deployment]: Deployment helper's release handoff and startup rollback.
