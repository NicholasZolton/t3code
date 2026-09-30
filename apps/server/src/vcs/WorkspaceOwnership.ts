// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { GitCommandError } from "@t3tools/contracts";
import type * as GitVcsDriver from "./GitVcsDriver.ts";
import { findVcsMarkerRoot, resolveJjRepoPaths } from "./JjRepo.ts";

export const WorkspaceKind = Schema.Literals(["git", "jj"]);
export type WorkspaceKind = typeof WorkspaceKind.Type;
const decodeKind = Schema.decodeUnknownEffect(WorkspaceKind);

export function makeWorkspaceOwnership(deps: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly execute: GitVcsDriver.GitVcsDriver["Service"]["execute"];
}) {
  const { fileSystem, path, execute } = deps;
  const repositoryCwd = Effect.fn("WorkspaceOwnership.repositoryCwd")(function* (cwd: string) {
    const marker = yield* findVcsMarkerRoot(fileSystem, path, cwd);
    return marker?.marker === "jj"
      ? (yield* resolveJjRepoPaths(fileSystem, path, marker.root)).mainWorkspaceRoot
      : cwd;
  });
  const normalize = Effect.fn("WorkspaceOwnership.normalize")(function* (value: string) {
    const absolute = path.resolve(value);
    let current = path.dirname(absolute);
    const suffix = [path.basename(absolute)];
    for (;;) {
      const canonical = yield* fileSystem.realPath(current).pipe(Effect.option);
      if (Option.isSome(canonical)) return path.join(canonical.value, ...suffix);
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      suffix.unshift(path.basename(current));
      current = parent;
    }
  });
  const location = Effect.fn("WorkspaceOwnership.location")(function* (input: {
    readonly cwd: string;
    readonly path: string;
  }) {
    const cwd = yield* repositoryCwd(input.cwd);
    const common = yield* execute({
      operation: "WorkspaceOwnership.commonDir",
      cwd,
      args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    });
    const normalized = yield* normalize(input.path);
    const digest = NodeCrypto.createHash("sha256").update(normalized).digest("hex");
    return {
      cwd,
      config: path.join(common.stdout.trim(), "config"),
      key: `t3.workspace-${digest}.kind`,
    };
  });
  const read = Effect.fn("WorkspaceOwnership.read")(function* (input: {
    readonly cwd: string;
    readonly path: string;
  }) {
    const target = yield* location(input);
    const result = yield* execute({
      operation: "WorkspaceOwnership.read",
      cwd: target.cwd,
      args: ["config", "--file", target.config, "--get", target.key],
      allowNonZeroExit: true,
    });
    if (result.exitCode === 1) return null;
    if (result.exitCode !== 0)
      return yield* new GitCommandError({
        operation: "WorkspaceOwnership.read",
        command: "git config",
        cwd: input.cwd,
        detail: result.stderr || "Could not read workspace ownership.",
      });
    return yield* decodeKind(result.stdout.trim()).pipe(
      Effect.mapError(
        (cause) =>
          new GitCommandError({
            operation: "WorkspaceOwnership.read",
            command: "git config",
            cwd: input.cwd,
            detail: "Workspace ownership is invalid.",
            cause,
          }),
      ),
    );
  });
  const remember = Effect.fn("WorkspaceOwnership.remember")(function* (input: {
    readonly cwd: string;
    readonly path: string;
    readonly kind: WorkspaceKind;
  }) {
    const target = yield* location(input);
    yield* execute({
      operation: "WorkspaceOwnership.remember",
      cwd: target.cwd,
      args: ["config", "--file", target.config, "--replace-all", target.key, input.kind],
    });
  });
  return { read, remember, normalize, repositoryCwd };
}
