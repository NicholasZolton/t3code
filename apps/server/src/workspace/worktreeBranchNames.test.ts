import { expect, it } from "vite-plus/test";
import {
  buildConfiguredWorktreeBranchName,
  flattenConfiguredWorktreeBranchName,
  isConfiguredWorktreeBranch,
} from "./worktreeBranchNames.ts";

it("honors a nested worktree prefix and still recognizes older temporary branches", () => {
  const prefix = "nick/task";
  const branch = buildConfiguredWorktreeBranchName(() => "DEADBEEF", prefix);
  expect(branch).toBe("nick/task/deadbeef");
  expect(isConfiguredWorktreeBranch(branch, prefix)).toBe(true);
  expect(isConfiguredWorktreeBranch("t3code/deadbeef", prefix)).toBe(true);
  expect(isConfiguredWorktreeBranch("other/deadbeef", prefix)).toBe(false);
  const flat = flattenConfiguredWorktreeBranchName(branch);
  expect(flat).toBe("nick-task-deadbeef");
  expect(isConfiguredWorktreeBranch(flat, prefix)).toBe(true);
});
