---
type: Playbook
title: Wiki maintenance
description: How to keep this repository's OKF v0.2 knowledge current, source-backed, and easy to navigate.
tags: [wiki, maintenance, okf]
status: stable
generated:
  by: opencode/gpt-6.1-sol
  at: 2026-09-30T02:53:04Z
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/62432a095456147ee71e70ac6e4dc0d2dea3ac30/okf/SPEC.md
    title: Open Knowledge Format v0.2 specification
    last_modified: 2026-08-21T01:44:53Z
---

# Wiki maintenance

`wiki/` is the bundle root. Keep durable fork decisions, integration boundaries,
and maintenance constraints here. Link to existing code and documentation for
implementation details. The format is Markdown with YAML frontmatter; no wiki
service or additional runtime is required.[^okf-spec]

## Writing and updating concepts

1. Read the relevant concept before changing a documented decision or behavior.
   Rewrite superseded current guidance rather than appending a competing account.
2. Every concept `.md` file needs frontmatter with a non-empty `type`. Include a
   `title`, one-sentence `description`, and `generated.by` / `generated.at` for
   meaningful edits. Use an explicit UTC offset in timestamps.
3. Record evidence in `sources`, preferably with stable IDs and immutable commit
   or specification URLs. Use matching footnotes for source-specific claims.
   Describe local-only Git evidence honestly instead of inventing a public URL.
4. Add `verified` only after checking the claims against their sources. Record the
   actual verifier and time; agents must not claim human review. Recheck affected
   claims after editing them before retaining a verification entry.
5. Give volatile observations an explicit snapshot time and exact revisions.
   If there is a known expiry, use `stale_after`. Do not present a historical
   observation as a live status.
6. Update the directory's `index.md` when concepts are added, moved, or renamed.
   Use relative links so they work in both the repository and OKF consumers.
7. Add a short entry to `log.md`, grouped under a UTC `YYYY-MM-DD` date, newest
   first. Link to the affected concept; avoid copying a PR description.

`index.md` and `log.md` are reserved filenames, not concepts. Only the root
`index.md` carries frontmatter, limited to `okf_version: "0.2"`; other indexes
and logs have none. Indexes list links with descriptions, and logs use dated
entries.[^okf-spec]

## Upstream integration records

Refresh [upstream integration](upstream-integration.md) after an upstream review
or completed sync. Record the fetched fork `main`, upstream tip, shared baseline,
integration commit, and observation time. Compute the gap against fork `main`,
not the current feature branch. A candidate merge remains unmerged until its
integration reaches `main`; conflict resolution alone is not completion.

After a sync reaches `main`, replace the current baseline and gap with verified
values and add a log entry. Keep important exceptions and unresolved omissions
visible, linking to their owning commits or PRs. This makes the record useful
for the next sync without turning it into a second implementation checklist.

## Validation

Before finishing a wiki edit, parse concept frontmatter as YAML, check the OKF
reserved-file rules and local links, and run the repository's Markdown formatter
on changed files. Verify Git-based claims with ancestry checks and commit counts.
Regenerate a diagram's SVG when its Mermaid source changes.

[^okf-spec]: Open Knowledge Format v0.2, sections 3–9, 11, and 12.
