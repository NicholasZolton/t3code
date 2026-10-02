# Wiki update log

## 2026-10-02

- **Integration candidate**: Recorded local full merge `24d2e49fd9` through upstream `99e08526e5` in [upstream integration](upstream-integration.md). The candidate includes all 50 commits; fork `main` at `b469d18b16` still awaits the sync. Retained the upstream-first policy and fork compatibility boundaries.

## 2026-09-30

- **Compatibility**: Added the selective Jujutsu port and durable mixed-backend recovery boundary to [upstream integration](upstream-integration.md), with links to the architecture and migration guidance.
- **Integration**: [PR #21](https://github.com/NicholasZolton/t3code/pull/21) reached fork `main` at `3da3d19cc2`. Refreshed [upstream integration](upstream-integration.md): all 81 commits through `0fcd5f9061` are incorporated, with zero remaining ancestry gap against that tip.
- **Update**: Recorded the full upstream branch merge `d8353ce56e` through `0fcd5f9061` in [upstream integration](upstream-integration.md), retained native OpenCode v2 compatibility, and documented SSH runtime version handoff. Fork `main` still awaits the 81-commit integration.
- **Initialization**: Established the repository-local OKF v0.2 bundle and [maintenance guidance](maintenance.md).
- **Creation**: Recorded [upstream integration](upstream-integration.md): the September 25 completed sync, the September 27 unmerged candidate, and the 81-commit gap split into 53 and 28 commits.
