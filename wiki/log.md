# Wiki update log

## 2026-10-10

- **Compatibility decision**: Recorded the experimental [paired Android notification](paired-notifications.md) authorization and opaque-payload boundary. T3 Connect delivery remains a separate path; physical-phone delivery remains unverified.

## 2026-10-08

- **Integration**: [PR #37](https://github.com/NicholasZolton/t3code/pull/37) reached fork `main` at `e5365adddc`. Refreshed [upstream integration](upstream-integration.md): all 280 newer commits through `9a3070bcf0` are incorporated, with zero ancestry gap, upstream worktree-location and skill-refresh adoption, and preserved canonical checkout grouping.

- **Integration candidate**: Recorded branch merge `2bc0f73832` through upstream `9a3070bcf0` in [upstream integration](upstream-integration.md). The branch contains all 280 newer commits; fetched fork `main` at `e4b289c26c` still awaits them. Documented upstream worktree-location and skill-refresh adoption while retaining canonical checkout grouping and fork recovery boundaries.

## 2026-10-07

- **Signing identity**: Recorded the persistent [private Android signing key](upstream-integration.md#private-android-signing-identity) and the requirement to preserve it across builds and upstream syncs.

## 2026-10-06

- **Recovery exception**: Recorded the fork-side [SSH recovery boundary](upstream-integration.md#ssh-recovery-exception), which preserves remote work on connection timeouts. Upstream `3a9c1a6df1` still has the destructive recovery paths at the October 6 review.

## 2026-10-05

- **Integration**: [PR #34](https://github.com/NicholasZolton/t3code/pull/34) reached fork `main` at `2586800144`. Refreshed [upstream integration](upstream-integration.md): all 114 newer commits through `1604ccc9d7` are incorporated, with zero ancestry gap and the accepted upstream MCP replacement.

- **Integration candidate**: Recorded local full merge `ab7e864a1a` through upstream `1604ccc9d7` in [upstream integration](upstream-integration.md). All 114 newer commits are on the branch; fork `main` at `75c7b1b95c` still awaits them. The candidate replaces the fork MCP policy with upstream targeting and combines catalog freshness with discovery retries.

- **Maintenance**: Clarified the [SSH runtime handoff](upstream-integration.md#ssh-runtime-release-handoff) constraint: loopback readiness does not verify phone access. Remote deployments must preserve remembered Tailscale publication and verify the original HTTPS environment identity after deployment or rollback.

## 2026-10-03

- **Integration**: [PR #32](https://github.com/NicholasZolton/t3code/pull/32) reached fork `main` at `a9b81ef5c5`. Refreshed [upstream integration](upstream-integration.md): all 60 reviewed commits through `65731f986b` are incorporated, with zero ancestry gap. The completed V2 sync retains the accepted legacy-history and protocol 2 boundaries.

- **Integration candidate**: Updated [upstream integration](upstream-integration.md) for local merge `696fd65db1` through `65731f986b`, the accepted legacy-history boundary, and retained fork features. Fork `main` remains at `0a5b85436b`; deployment and main integration are pending.

- **Review**: Refreshed [upstream integration](upstream-integration.md) against fork `main` at `0a5b85436b` and upstream `65731f986b`: 60 commits remain unmerged, with 105 full-merge conflicts. Recorded V2 legacy-history and protocol rollout decisions, new upstream native OpenCode 2 support, and the fork compatibility protections still required.

## 2026-10-02

- **Integration**: [PR #27](https://github.com/NicholasZolton/t3code/pull/27) reached fork `main` at `60e0650513`. Refreshed [upstream integration](upstream-integration.md): all 50 reviewed commits through `99e08526e5` are incorporated, with zero remaining ancestry gap against that tip.
- **Integration candidate**: Recorded local full merge `24d2e49fd9` through upstream `99e08526e5` in [upstream integration](upstream-integration.md). The candidate includes all 50 commits; fork `main` at `b469d18b16` still awaits the sync. Retained the upstream-first policy and fork compatibility boundaries.

## 2026-09-30

- **Compatibility**: Added the selective Jujutsu port and durable mixed-backend recovery boundary to [upstream integration](upstream-integration.md), with links to the architecture and migration guidance.
- **Integration**: [PR #21](https://github.com/NicholasZolton/t3code/pull/21) reached fork `main` at `3da3d19cc2`. Refreshed [upstream integration](upstream-integration.md): all 81 commits through `0fcd5f9061` are incorporated, with zero remaining ancestry gap against that tip.
- **Update**: Recorded the full upstream branch merge `d8353ce56e` through `0fcd5f9061` in [upstream integration](upstream-integration.md), retained native OpenCode v2 compatibility, and documented SSH runtime version handoff. Fork `main` still awaits the 81-commit integration.
- **Initialization**: Established the repository-local OKF v0.2 bundle and [maintenance guidance](maintenance.md).
- **Creation**: Recorded [upstream integration](upstream-integration.md): the September 25 completed sync, the September 27 unmerged candidate, and the 81-commit gap split into 53 and 28 commits.
