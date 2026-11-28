import {
  buildTemporaryWorktreeBranchName,
  flattenTemporaryWorktreeBranchName,
  isTemporaryWorktreeBranch,
  WORKTREE_BRANCH_PREFIX,
} from "@t3tools/shared/git";

const TEMPORARY_HEX = "[0-9a-f]{8}";
const LEGACY_UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const CUSTOM_TOKEN = `(?:${TEMPORARY_HEX}|${LEGACY_UUID})`;
const CUSTOM_TOKEN_PATTERN = new RegExp(`^${CUSTOM_TOKEN}$`);
const CUSTOM_BRANCH_PATTERN = new RegExp(`^(.*)[-/](${CUSTOM_TOKEN})$`);

export function buildConfiguredWorktreeBranchName(
  randomHex: (byteLength: number) => string,
  prefix: string,
): string {
  const branch = buildTemporaryWorktreeBranchName(randomHex);
  return prefix + branch.slice(WORKTREE_BRANCH_PREFIX.length);
}

export function isConfiguredWorktreeBranch(branch: string, prefix: string): boolean {
  if (isTemporaryWorktreeBranch(branch)) return true;
  if (prefix === WORKTREE_BRANCH_PREFIX) return false;
  const normalized = branch.trim().toLowerCase();
  const namespace = prefix.toLowerCase();
  return [`${namespace}/`, `${namespace.replaceAll("/", "-")}-`].some(
    (start) =>
      normalized.startsWith(start) && CUSTOM_TOKEN_PATTERN.test(normalized.slice(start.length)),
  );
}

export function flattenConfiguredWorktreeBranchName(branch: string): string {
  if (isTemporaryWorktreeBranch(branch)) return flattenTemporaryWorktreeBranchName(branch);
  const normalized = branch.trim().toLowerCase();
  const match = normalized.match(CUSTOM_BRANCH_PATTERN);
  const prefix = match?.[1];
  const token = match?.[2];
  if (!prefix || !token) return normalized;
  return `${prefix.replaceAll("/", "-")}-${token.slice(0, 8)}`;
}
