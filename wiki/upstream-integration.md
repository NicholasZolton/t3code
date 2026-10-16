---
type: Integration Record
title: Upstream integration
description: Main and branch integration boundaries and fork compatibility exceptions.
tags: [upstream, fork, integration]
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-10-16T14:32:27+00:00
verified:
  - by: opencode/gpt-6.1-sol
    at: 2026-10-16T14:32:27+00:00
snapshot:
  at: 2026-10-16T14:32:27+00:00
  fork_main: d3b3491750d65d0ddfc8bd1b192c616005560d64
  upstream_main: 3962ae8586333310eeef655c917389b35f7b679d
  shared_baseline: 3962ae8586333310eeef655c917389b35f7b679d
  last_main_integration: 837d227b910791a9f9c28c6fea2609af3f40085c
  last_main_upstream: 3962ae8586333310eeef655c917389b35f7b679d
  missing_upstream_on_main: 0
  missing_upstream_at_integrated_tip: 0
  branch_integration: 837d227b910791a9f9c28c6fea2609af3f40085c
  branch_parent: f2d43354c9acdd8b2ecd777afa8fb9103ff336fb
  missing_upstream_on_branch: 0
sources:
  - id: october-16-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/50
    title: Completed October 16 upstream integration into fork main
  - id: october-16-main-review-git
    resource: "Local Git verification at 2026-10-16T14:32:27+00:00: fetched origin/main and local main both equal d3b3491750d65d0ddfc8bd1b192c616005560d64, with parents f2d43354c9acdd8b2ecd777afa8fb9103ff336fb and 80c7adc76b539ce0240aa541d8a1a0c83d23d5a2. Integration 837d227b910791a9f9c28c6fea2609af3f40085c and upstream 3962ae8586333310eeef655c917389b35f7b679d are ancestors of main. The shared baseline equals that pinned upstream tip, all 96 incoming commits are incorporated, and zero upstream commits are missing on main. PR 50 merged at 2026-10-16T14:31:00Z. Remote deployment remains separate."
    title: Completed main ancestry checks against the pinned upstream tip
  - id: october-16-branch-integration
    resource: https://github.com/NicholasZolton/t3code/commit/837d227b910791a9f9c28c6fea2609af3f40085c
    title: Ancestry-preserving merge through 3962ae8586, now incorporated into main
  - id: october-16-review-git
    resource: "Local Git verification at 2026-10-16T04:12:58+00:00: origin/main and local main equal f2d43354c9acdd8b2ecd777afa8fb9103ff336fb. The shared baseline with upstream 3962ae8586333310eeef655c917389b35f7b679d is e536bfd33bc3c351997141d93790df75eeded7b9, leaving 96 upstream commits missing on main. Merge 837d227b910791a9f9c28c6fea2609af3f40085c has that fork main and pinned upstream tip as parents, with zero missing upstream commits on the branch. All 669 incoming paths without prior fork changes match upstream byte-for-byte. Fork prompts, Vim, shortcuts, weighted search, OpenCode safeguards and accounts, SSH guards, paired notifications, Crit/Portless, and Jujutsu remain. No push, main integration, or remote deployment has occurred."
    title: Branch ancestry, main gap, and upstream-first source audit
  - id: october-16-upstream
    resource: https://github.com/pingdotgg/t3code/commit/3962ae8586333310eeef655c917389b35f7b679d
    title: Pinned upstream tip for the completed October 16 integration
  - id: october-15-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/48
    title: Completed October 15 upstream integration into fork main
  - id: october-15-main-review-git
    resource: "Local Git verification at 2026-10-15T14:33:08+00:00: fetched origin/main and local main both equal 9ce8f0a504b8abe1af9feead20ae1714c0d9ded8, with parents e9e7b07c0dfdc421d4216b2164cd4efe4ec4588d and d3b9e1b76e9815a6dfae066d85a272f24c81536d. Integration 30b7fbff813e913ac3b88ae58ebe1dd47b50fc4f and upstream e536bfd33bc3c351997141d93790df75eeded7b9 are ancestors of main. The shared baseline equals that pinned upstream tip, all 106 incoming commits are incorporated, and zero upstream commits are missing on main. PR 48 merged at 2026-10-15T14:32:29Z. Remote deployment remains separate."
    title: Completed main ancestry checks against the pinned upstream tip
  - id: october-15-branch-integration
    resource: https://github.com/NicholasZolton/t3code/commit/30b7fbff813e913ac3b88ae58ebe1dd47b50fc4f
    title: Ancestry-preserving merge through e536bfd33b, now incorporated into main
  - id: october-15-review-git
    resource: "Local Git verification at 2026-10-15T04:11:12+00:00: origin/main and local main equal e9e7b07c0dfdc421d4216b2164cd4efe4ec4588d. The shared baseline with upstream e536bfd33bc3c351997141d93790df75eeded7b9 is 6002c5c68c637de2cd2557bd6c40e46c153e39b1, leaving 106 upstream commits missing on main. Merge 30b7fbff813e913ac3b88ae58ebe1dd47b50fc4f has fork e9e7b07c0dfdc421d4216b2164cd4efe4ec4588d and upstream e536bfd33bc3c351997141d93790df75eeded7b9 as parents, with zero missing upstream commits on the branch. Of 425 incoming paths without prior fork changes, 423 match upstream byte-for-byte; two composer tests supply the fork's required keybindings. Upstream managed SSH recovery and ownership cleanup are adopted; external/discovered readiness guards and unreplaced fork features remain. No push, main integration, or remote deployment has occurred."
    title: Branch ancestry, main gap, and upstream-first source audit
  - id: october-15-upstream
    resource: https://github.com/pingdotgg/t3code/commit/e536bfd33bc3c351997141d93790df75eeded7b9
    title: Pinned upstream tip for the October 15 branch integration
  - id: october-14-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/47
    title: Completed October 14 upstream integration into fork main
  - id: october-14-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/65729a46467ede150ca3b42ad34f58e9f23d027f
    title: Fork main after PR 47 merged with upstream ancestry preserved
  - id: october-14-main-review-git
    resource: "Local Git verification at 2026-10-14T15:40:24+00:00: fetched origin/main and local main both equal 65729a46467ede150ca3b42ad34f58e9f23d027f, with parents 1a005f7db369b60533d98ef63177cf03e765b50d and ba5362c81a1082db1eac60f0d666ea8380474d7c. Both upstream merges 24ab07ed900d70c4fac0e06c58262d818e202753 and 2f17f4f635e021d775c0f6c1ebe030bcba0f5d55 are ancestors of main. The shared baseline equals upstream 6002c5c68c637de2cd2557bd6c40e46c153e39b1, with all 42 incoming commits incorporated and zero missing upstream commits. PR 47 merged at 2026-10-14T15:39:28Z."
    title: Completed main ancestry checks against the pinned upstream tip
  - id: october-14-branch-integration
    resource: https://github.com/NicholasZolton/t3code/commit/2f17f4f635e021d775c0f6c1ebe030bcba0f5d55
    title: Ancestry-preserving integration through 6002c5c68c, now incorporated into main
  - id: october-14-review-git
    resource: "Local Git verification at 2026-10-14T04:13:20Z: fetched origin/main 1a005f7db369b60533d98ef63177cf03e765b50d and upstream/main 6002c5c68c637de2cd2557bd6c40e46c153e39b1 share baseline 5070a83a3248c537d3baaf063e719f179c49bb52, with 42 missing upstream commits on main. Initial merge 24ab07ed900d70c4fac0e06c58262d818e202753 has fork main and upstream 11fd54fcbbfb39f824bb4c908d428c20d801267c as parents. Follow-up merge 2f17f4f635e021d775c0f6c1ebe030bcba0f5d55 has branch parent 0a5dafd0eb94641d642324c727ed1c9683556c43 and upstream 6002c5c68c637de2cd2557bd6c40e46c153e39b1 as parents, contains the initial merge, and has zero missing upstream commits. Of 115 incoming paths without prior fork changes, 114 are byte-identical to upstream; the only exception uses GITHUB_EVENT_PATH in the webhook workflow. Both web scoped-settings implementation paths now match upstream exactly. SSH recovery, OpenCode child execution tracking, and the bundled model manifest are unchanged in the incoming range."
    title: Initial branch boundary and upstream-first resolutions before main integration
  - id: october-14-upstream
    resource: https://github.com/pingdotgg/t3code/commit/6002c5c68c637de2cd2557bd6c40e46c153e39b1
    title: Pinned upstream tip for the completed October 14 integration
  - id: october-13-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/46
    title: Completed October 13 upstream integration into fork main
  - id: october-13-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/eb4dc2fd6e962f129b6969883927438b57cfe36c
    title: Fork main after PR 46 merged with upstream ancestry preserved
  - id: october-13-integration
    resource: https://github.com/NicholasZolton/t3code/commit/801585a0bd383420165e9139e323ee67f6507a9a
    title: Ancestry-preserving integration through 5070a83a32, now incorporated into main
  - id: october-13-review-git
    resource: "Local Git verification at 2026-10-13T05:39:00Z: fetched origin/main eb4dc2fd6e962f129b6969883927438b57cfe36c contains integration 801585a0bd383420165e9139e323ee67f6507a9a and upstream 5070a83a3248c537d3baaf063e719f179c49bb52; all 48 incoming commits are incorporated with zero gap at the integrated tip; shared baseline against fetched upstream e9221e44dadd78126c83d2eeed0b51c25dcf0fb4 is 5070a83a3248c537d3baaf063e719f179c49bb52, leaving exactly 540a3e89ed and e9221e44da unmerged; PR 46 merged at 2026-10-13T05:38:02Z"
    title: Completed main integration and two newer unmerged commits verified separately
  - id: october-13-upstream
    resource: https://github.com/pingdotgg/t3code/commit/5070a83a3248c537d3baaf063e719f179c49bb52
    title: Pinned upstream tip for the latest main integration
  - id: october-13-newer-upstream
    resource: https://github.com/pingdotgg/t3code/compare/5070a83a3248c537d3baaf063e719f179c49bb52...e9221e44dadd78126c83d2eeed0b51c25dcf0fb4
    title: Two subsequently inspected upstream commits, not included in PR 46
  - id: shared-pr-workflow
    resource: ../apps/server/src/jj/JjWorkflow.ts
    title: Jujutsu adapter feeds named bases into the shared change-request workflow
  - id: crit-tailnet-forwarding
    resource: ../apps/server/src/process/CritManager.ts
    title: Review-owned Crit forwarding, implemented on this branch; deployment is separate
  - id: tailscale-foreground-serve
    resource: https://github.com/tailscale/tailscale/blob/3caf7d9e7dcaba589cfc58beda596929733e4fea/cmd/tailscale/cli/serve_v2.go
    title: Tailscale foreground Serve sessions and their connection-owned lifetime
  - id: october-12-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/44
    title: Completed October 12 full upstream integration into fork main
  - id: october-12-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/f4a2d2472c90d7828be6830cfee01f4b76d7f2f7
    title: Fork main after PR 44 merged with upstream ancestry preserved
  - id: october-12-branch-integration
    resource: https://github.com/NicholasZolton/t3code/commit/eec69e1928b4aadf52e78fd2b14f9df6aa1f5f44
    title: Ancestry-preserving upstream merge now incorporated into fork main
  - id: october-12-review-git
    resource: "Local Git verification at 2026-10-12T06:04:06Z: fetched origin/main f4a2d2472c90d7828be6830cfee01f4b76d7f2f7 contains integration eec69e1928b4aadf52e78fd2b14f9df6aa1f5f44 and upstream e688034b5f5505f92fcf1d78ba853c9c0107f9f1; the merge base is the pinned upstream tip, with all 374 previously missing commits incorporated and zero remaining main ancestry gap; PR 44 merged at 2026-10-12T06:03:14Z"
    title: Completed main integration boundary verified against pinned upstream
  - id: october-8-main-integration
    resource: https://github.com/NicholasZolton/t3code/pull/37
    title: Completed October 8 full upstream integration into fork main
  - id: october-8-fork-main
    resource: https://github.com/NicholasZolton/t3code/commit/e5365adddc46e74a197f1f698a6ec79f12b92d99
    title: Fork main after PR 37 merged with upstream ancestry preserved
  - id: october-8-integration
    resource: https://github.com/NicholasZolton/t3code/commit/2bc0f738329c83c0a7e146018d640a512634f876
    title: Full upstream merge with parents e4b289c26c and 9a3070bcf0, now incorporated into main
  - id: october-8-review-git
    resource: "Local Git verification at 2026-10-08T18:51:57Z: origin/main e5365adddc46e74a197f1f698a6ec79f12b92d99 contains integration 2bc0f738329c83c0a7e146018d640a512634f876 and upstream 9a3070bcf023c3c025633659addeef4cf628133a; merge base is the pinned upstream tip; all 280 previously missing commits are incorporated with zero ancestry gap; PR 37 merged at 2026-10-08T18:49:13Z"
    title: Verified completed October 8 integration boundary
  - id: upstream-worktree-location
    resource: https://github.com/pingdotgg/t3code/commit/1024941575067f68d909c6b98f56b02edac25b37
    title: Upstream worktree location and previous-directory tracking
  - id: upstream-skill-refresh
    resource: https://github.com/pingdotgg/t3code/commit/a1830915ecf70e3ad4fbe8efb15ae9f18517eb54
    title: Upstream five-minute workspace discovery cache and refresh policy
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
    resource: https://github.com/pingdotgg/t3code/blob/6002c5c68c637de2cd2557bd6c40e46c153e39b1/apps/server/src/provider/model-manifest.json
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
    title: Upstream managed recovery with fork external/discovered readiness guards
  - id: upstream-ssh-recovery
    resource: https://github.com/pingdotgg/t3code/blob/e536bfd33bc3c351997141d93790df75eeded7b9/packages/ssh/src/tunnel.ts
    title: Upstream managed-server recovery and ownership cleanup at the reviewed tip
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

The newest completed sync is
[PR #50](https://github.com/NicholasZolton/t3code/pull/50), which reached fork
`main` at `d3b3491750`. Merge `837d227b91` contains all 96 incoming commits
through upstream `3962ae8586`, with ancestry preserved. The shared baseline
equals that pinned upstream tip, with zero missing upstream commits on `main`.
[^october-16-main-integration][^october-16-main-review-git]

This is a revision-pinned snapshot, not a claim about newer upstream work.
Refresh it after the next review or integration using the
[maintenance guidance](maintenance.md).

## Completed October 16 sync

[PR #50](https://github.com/NicholasZolton/t3code/pull/50) merged on October 16,
2026, at 14:31:00 UTC. Its landing commit
`d3b3491750d65d0ddfc8bd1b192c616005560d64` preserves previous fork `main`
`f2d43354c9acdd8b2ecd777afa8fb9103ff336fb` and integrated branch tip
`80c7adc76b539ce0240aa541d8a1a0c83d23d5a2` as parents.
[^october-16-main-integration][^october-16-main-review-git]

Merge `837d227b910791a9f9c28c6fea2609af3f40085c` has fork parent
`f2d43354c9acdd8b2ecd777afa8fb9103ff336fb` and upstream parent
`3962ae8586333310eeef655c917389b35f7b679d`. Both parents are incorporated into
fork `main`; the sync was not squashed. Main integration is not a remote deployment.
[^october-16-branch-integration][^october-16-main-review-git]

Adopt upstream v0.1.0/Beta branding, mobile shared controls, stable callback
handling, provider fixes, live command output, and database maintenance. Fork
mobile screens use upstream's reorganized UI components and dialog presenter;
prompts, Vim, shortcuts, account controls, paired notifications, Crit/Portless,
SSH guards, and mixed Git/Jujutsu behavior remain. Model search uses the fork's
shared scorer with position-independent matching to retain upstream's newest-first
ties, rather than duplicating scoring logic. All 669 incoming paths without prior
fork changes match upstream exactly.[^october-16-review-git][^october-16-upstream]

## Completed October 15 sync

[PR #48](https://github.com/NicholasZolton/t3code/pull/48) merged on October 15,
2026, at 14:32:29 UTC. Its landing commit
`9ce8f0a504b8abe1af9feead20ae1714c0d9ded8` preserves previous fork `main`
`e9e7b07c0dfdc421d4216b2164cd4efe4ec4588d` and integrated branch tip
`d3b9e1b76e9815a6dfae066d85a272f24c81536d` as parents.
[^october-15-main-integration][^october-15-main-review-git]

Merge `30b7fbff813e913ac3b88ae58ebe1dd47b50fc4f` has fork parent
`e9e7b07c0dfdc421d4216b2164cd4efe4ec4588d` and upstream parent
`e536bfd33bc3c351997141d93790df75eeded7b9`. Both parents are incorporated into
fork `main`; the sync was not squashed. Main integration is not a remote deployment.
[^october-15-branch-integration][^october-15-upstream][^october-15-main-review-git]

Adopt upstream's managed SSH recovery and ownership cleanup. Keep the smaller
external/discovered readiness guards described below, plus Jujutsu recovery,
OpenCode execution tracking and account controls, saved prompts/Vim,
Crit/Portless, and paired notifications. Upstream-only incoming paths match
upstream except for required keybindings in two composer tests.
[^october-15-review-git]

## Completed October 14 sync

[PR #47](https://github.com/NicholasZolton/t3code/pull/47) merged on October 14,
2026, at 15:39:28 UTC. Its landing commit `65729a46467ede150ca3b42ad34f58e9f23d027f`
preserves previous fork `main` `1a005f7db369b60533d98ef63177cf03e765b50d` and
integrated branch tip `ba5362c81a1082db1eac60f0d666ea8380474d7c` as parents.
[^october-14-main-integration][^october-14-fork-main]

Merge `24ab07ed900d70c4fac0e06c58262d818e202753` preserves fork parent
`1a005f7db369b60533d98ef63177cf03e765b50d` and upstream parent
`11fd54fcbbfb39f824bb4c908d428c20d801267c`. Follow-up merge
`2f17f4f635e021d775c0f6c1ebe030bcba0f5d55`, with branch parent
`0a5dafd0eb94641d642324c727ed1c9683556c43` and upstream parent
`6002c5c68c637de2cd2557bd6c40e46c153e39b1`, includes the usage-source label fix
published during final validation. Both merges are incorporated into fork `main`;
the sync was not squashed. Main integration is not a remote deployment.
[^october-14-branch-integration][^october-14-main-review-git][^october-14-upstream]

Upstream's generic dropped-settings detection replaces the fork's web worktree-only
check and separate ignored-write result. Both web implementation paths now match
upstream exactly; retain the mobile worktree warning, which upstream still does not
provide. Inline slash skill search coexists with saved prompts, and the macOS autofill
opt-out coexists with held-key repeat. Delegated worktree isolation uses upstream's
launch service, retaining the fork's configurable temporary branch prefix and
Git/Jujutsu provisioning boundaries.[^october-14-review-git]

The incoming range does not replace the SSH recovery or reused OpenCode child
execution safeguards. Keep those exceptions, account controls, prompts/Vim, Crit
forwarding, and paired Android delivery. Upstream-only incoming files remain
unchanged except for using the runner's `GITHUB_EVENT_PATH` instead of shell-template
interpolation in the webhook workflow; the imported retry behavior is unchanged.
[^october-14-review-git]

## October 13 main sync

[PR #46](https://github.com/NicholasZolton/t3code/pull/46) merged on October 13,
2026, at 05:38:02 UTC, landing at `eb4dc2fd6e`.
[^october-13-main-integration][^october-13-fork-main]

Merge `801585a0bd383420165e9139e323ee67f6507a9a` preserves fork parent
`373e85e76687ec991b5fb4e7b6c47b46ff676e1e` and upstream parent
`5070a83a3248c537d3baaf063e719f179c49bb52`. Both parents are incorporated into
fork `main`; the sync was not squashed. Main integration is not a remote deployment.
[^october-13-integration][^october-13-review-git]

Adopt upstream's PR cache, connection recovery, provider outcomes, secret handling,
prompt links, client fixes, and mobile dependencies. Keep the fork's shared
Git/Jujutsu PR workflow: each adapter normalizes saved PR bases to a named branch
or bookmark, so upstream's checkout-revision fix applies in both lanes without
duplicating the workflow. Upstream-only paths remain unchanged apart from the
Git-action test fixtures needed for fork VCS discovery.[^october-13-integration][^shared-pr-workflow]

This upstream range changes neither OpenCode's adapter nor SSH recovery. Claude's
child-outcome fixes do not replace the reused OpenCode execution safeguard below.
Preserve those exceptions and the other unreplaced fork behavior.
[^october-13-upstream]

The active-tool collection optimization (`540a3e89ed`) and pace-icon alignment
fix (`e9221e44da`) were excluded from PR #46. They are now included in the completed
October 14 sync on fork `main`.
[^october-13-newer-upstream][^october-14-main-review-git]

## October 12 main sync

[PR #44](https://github.com/NicholasZolton/t3code/pull/44) merged on October 12,
2026, at 06:03:14 UTC, landing at `f4a2d2472c`.
[^october-12-main-integration][^october-12-fork-main]

Merge `eec69e1928b4aadf52e78fd2b14f9df6aa1f5f44` preserves fork parent
`e373457c74fd6b224a9019c4d8c20c6fa06fe7d9` and upstream parent
`e688034b5f5505f92fcf1d78ba853c9c0107f9f1`. Both parents are incorporated into
fork `main`; the sync was not squashed. Main integration is not a remote deployment.
[^october-12-branch-integration]

The sync adopts upstream's extracted provider and source-control packages,
legacy provider-settings removal, desktop main-contents commands, and Git-only
storage cleanup. Fork features use those upstream boundaries rather than parallel
implementations. Jujutsu cleanup and reused OpenCode child sessions retain the
compatibility exceptions below.[^october-12-branch-integration]

## Previous main sync

[PR #37](https://github.com/NicholasZolton/t3code/pull/37) merged on October 8,
2026, at 18:49:13 UTC, landing at `e5365adddc`.
Merge `2bc0f738329c83c0a7e146018d640a512634f876` preserves ancestry from fork
`e4b289c26c` and upstream `9a3070bcf0`. Both parents are incorporated into fork
`main`; the sync was not squashed. Main integration is not a remote deployment.
[^october-8-main-integration][^october-8-fork-main][^october-8-integration]

The sync adopts upstream's `worktreesDirectory` setting, Storage control,
path validation, and previous-location tracking. Saved fork `worktreeDirectory`
values migrate on load; an explicitly saved upstream value wins. Retain the
fork's canonical-checkout grouping: `<location>/<original checkout>/<worktree>`,
even when creating from a linked worktree. The optional flat layout and custom
temporary branch prefixes remain. Defaults use upstream's `t3/` prefix and its
namespace-collision fallback; existing legacy names stay recognized.
[^october-8-integration][^upstream-worktree-location]

Workspace discovery now uses upstream's provider registry and five-minute
freshness/refresh policy across clients. The old fork catalog helper and
`invalidateWorkspaceSnapshots` API are removed, rather than maintained as a
parallel refresh path. Preserve the unrelated fork boundaries below, including
mixed Git/Jujutsu recovery, SSH reconnect preservation, configured OpenCode
permissions and reused-subagent tracking, prompts, Vim, accounts, Crit/Portless,
and private Android signing.[^october-8-integration][^upstream-skill-refresh]

## Previous upstream sync

[PR #34](https://github.com/NicholasZolton/t3code/pull/34) merged on October 5,
2026, at 20:00:02 UTC, landing at `2586800144` with no ancestry gap against
`1604ccc9d7`.[^october-5-main-integration][^latest-review-git]

Merge `ab7e864a1aa3ce44d99454b8e363297227475ead` preserves upstream ancestry,
with fork parent `9064bb3d8e` and upstream parent `1604ccc9d7`. The branch also
incorporates fork `main`'s docs-only remote-deployment update. Both parents are
incorporated into fork `main`; the sync was not squashed.
[^october-5-candidate][^october-5-fork-main][^latest-review-git]

The maintainer chose upstream's MCP implementation in full: explicit targets,
external callers, cross-project access, and caller permission ceilings replace
the fork's none/project/environment access policy and its settings. Future syncs
should not restore that parallel policy. This sync combined fork catalog freshness
with upstream incomplete-discovery retries; the October 8 sync replaces that
combined implementation with upstream's newer refresh policy. Upstream OpenCode
parser and permission helper tests replaced the overlapping fork-only attachment test.
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

## Last completed main integration

| Item                                               | Recorded value                           |
| -------------------------------------------------- | ---------------------------------------- |
| Fork                                               | `NicholasZolton/t3code`, remote `origin` |
| Upstream                                           | `pingdotgg/t3code`, remote `upstream`    |
| Main landing commit                                | `9ce8f0a504`: merge of PR #48            |
| Upstream integration commit                        | `30b7fbff81`: merge through `e536bfd33b` |
| Fork-side parent                                   | `e9e7b07c0d`                             |
| Upstream-side parent / shared baseline             | `e536bfd33b`                             |
| Missing commits at that integration's upstream tip | **0**                                    |

Default to upstream implementations. Retain fork code for explicit features
or fixes upstream does not provide. Native OpenCode 2 and thread management now
use upstream services; fork configuration and UI improvements remain layered on
those paths.[^october-15-branch-integration]

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

Reused OpenCode child sessions still need fork admission and execution tracking.
At `3962ae8586`, parent reports identify the child session but not the individual
execution. Once a child is reused, ambiguous reports must not attach stale results
or settle the new call; observed execution can settle it without a result. Preserve
this safeguard until upstream can attribute reports to individual runs.
[^october-12-branch-integration][^october-16-review-git]

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

The completed October 12 sync uses upstream Git-only storage cleanup and retains every
Jujutsu workspace instead of maintaining a separate automatic removal path.
Jujutsu checkpoints still pin native snapshots: they lack the extra Git checkpoint
commit's capture-time HEAD metadata, so authored-path filtering stays disabled and
turn diffs retain all changes. Snapshot capture and restore remain available.
[^october-12-branch-integration]

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

Upstream `e536bfd33b` now separates stale-tunnel cleanup from remote shutdown
and preserves an unresponsive managed server. The main integration adopts that recovery
and upstream's ownership cleanup, including replacement when an adopted server
demonstrably exits during handover.[^upstream-ssh-recovery][^october-15-review-git]

Keep the fork's remaining readiness guards: a discovered server with a live PID,
or a remembered external endpoint without proof of exit, must not be replaced
merely because readiness times out. This avoids starting competing servers
against the same T3 home. Explicit Disconnect, desktop shutdown, and requested
managed-runner changes retain their existing behavior.[^ssh-recovery]

The guards retain the remaining protection associated with issue #15608; do not
restore the older parallel managed-server recovery implementation.
[^ssh-recovery-issue][^october-15-review-git]

## Crit remote review boundary

Crit's frontend assumes its own origin root, so tailnet reviews use a separate,
temporary HTTPS endpoint rather than a subpath of the T3 server. Preserve
foreground Serve ownership: closing a review must remove only its endpoint,
never the environment's persistent publication or another review. This branch
supports Tailscale connections alongside SSH/Portless; T3 Connect-only forwarding
is outside that boundary. Crit has no application authentication, so these endpoints
must remain tailnet-only, not Funnel publications.[^crit-tailnet-forwarding][^tailscale-foreground-serve]

Existing file shares can require elevated Serve access even for a proxy-only
change. On Unix, retry permission failures with non-interactive `sudo -n`;
never change the host's operator settings or persistent routes to open a
review.[^crit-tailnet-forwarding]

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
git merge-base --is-ancestor 2bc0f73832 origin/main
git merge-base --is-ancestor eec69e1928 origin/main
git merge-base --is-ancestor 801585a0bd origin/main
git merge-base --is-ancestor 2f17f4f635 origin/main
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

[^ssh-recovery]: Integrated SSH implementation and its focused readiness-recovery regressions.

[^crit-tailnet-forwarding]: The review manager keeps Crit on loopback and owns each temporary forward's lifetime.

[^tailscale-foreground-serve]: Foreground Serve uses a nested configuration tied to its IPN watcher; closing that session removes its publication.

[^upstream-ssh-recovery]: Exact upstream SSH source supplying managed-server and stale-tunnel recovery.

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

[^october-8-main-integration]: PR #37 and its recorded merge time.

[^october-8-fork-main]: Main landing commit retaining the complete upstream ancestry.

[^october-8-integration]: Full upstream merge, its exact parents, and retained fork boundaries, now incorporated into main.

[^october-8-review-git]: Completed main ancestry checks and zero missing commits against the October 8 pinned upstream tip.

[^upstream-worktree-location]: Upstream location resolution and managed-directory history selected for the completed sync.

[^upstream-skill-refresh]: Upstream workspace discovery freshness and refresh machinery selected for the completed sync.

[^october-12-main-integration]: PR #44 and its recorded merge time.

[^october-12-fork-main]: Main landing commit retaining the complete upstream ancestry.

[^october-12-branch-integration]: Full upstream merge, its exact parents, and retained compatibility decisions, now incorporated into main.

[^october-12-review-git]: Completed main ancestry checks and zero missing commits against the October 12 pinned upstream tip.

[^october-13-main-integration]: PR #46 and its recorded merge time.

[^october-13-fork-main]: Main landing commit retaining the complete upstream ancestry.

[^october-13-integration]: Completed upstream merge and its exact fork and upstream parents.

[^october-13-review-git]: Completed main ancestry checks, zero gap at the integrated tip, and two newer unmerged commits.

[^october-13-upstream]: Exact upstream revision and unchanged OpenCode/SSH package paths since e688034b5f.

[^october-13-newer-upstream]: Exact newer upstream range excluded from PR #46.

[^shared-pr-workflow]: Shared change-request step with backend-specific saved-base normalization.

[^october-14-main-integration]: PR #47 and its recorded merge time.

[^october-14-fork-main]: PR landing commit retaining upstream ancestry.

[^october-14-main-review-git]: Completed main ancestry checks, exact revisions and parents, and zero gap against the pinned upstream tip.

[^october-14-branch-integration]: Upstream integration merges and their exact parents, now incorporated into main.

[^october-14-review-git]: Initial pre-integration main gap, zero branch gap, preserved compatibility exceptions, and upstream-first conflict resolutions.

[^october-14-upstream]: Exact upstream revision incorporated into the completed October 14 sync.

[^october-15-branch-integration]: Upstream merge and its exact parents, now incorporated into main.

[^october-15-review-git]: Pinned main gap, zero branch gap, source audit, and retained compatibility exceptions.

[^october-15-upstream]: Exact upstream revision incorporated into the completed October 15 sync.

[^october-15-main-integration]: PR #48 and its recorded merge time.

[^october-15-main-review-git]: Completed main ancestry checks, exact revisions and parents, and zero gap against the pinned upstream tip.

[^october-16-branch-integration]: Upstream merge and its exact fork and upstream parents, now incorporated into main.

[^october-16-review-git]: Pinned main gap, zero branch gap, source audit, and retained fork compatibility boundaries.

[^october-16-upstream]: Exact upstream revision incorporated into the completed October 16 sync.

[^october-16-main-integration]: PR #50 and its recorded merge time.

[^october-16-main-review-git]: Completed main ancestry checks, exact revisions and parents, and zero gap against the pinned upstream tip.
