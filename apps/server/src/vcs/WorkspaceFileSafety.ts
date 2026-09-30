import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as GitVcsDriver from "./GitVcsDriver.ts";

// A private index makes this work for secondary jj workspaces without consulting the main Git index.
export const inspectWorkspaceFiles = Effect.fn("WorkspaceFileSafety.inspect")(function* (input: {
  readonly cwd: string;
  readonly repositoryCwd: string;
  readonly revision: string;
  readonly includeIgnored?: boolean;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly execute: GitVcsDriver.GitVcsDriver["Service"]["execute"];
}) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* input.fileSystem.makeTempDirectoryScoped({
        prefix: "t3-workspace-index-",
      });
      const env = { GIT_INDEX_FILE: input.path.join(directory, "index") };
      const run = (args: ReadonlyArray<string>) =>
        input.execute({
          operation: "WorkspaceFileSafety.inspect",
          cwd: input.repositoryCwd,
          args: ["--work-tree", input.cwd, ...args],
          env,
          maxOutputBytes: 64 * 1024,
        });
      yield* run(["read-tree", input.revision]);
      const other = yield* run(["ls-files", "--others", "--exclude-standard", "--directory", "-z"]);
      const ignored =
        input.includeIgnored === false
          ? null
          : yield* run([
              "ls-files",
              "--others",
              "--ignored",
              "--exclude-standard",
              "--directory",
              "-z",
            ]);
      const isMetadata = (entry: string): boolean => entry === ".jj/" || entry.startsWith(".jj/");
      const exclusions = other.stdout
        .split("\0")
        .filter((entry) => entry !== "" && !isMetadata(entry));
      const truncated = other.stdoutTruncated;
      return {
        exclusions,
        truncated,
        hasUnpreservedFiles:
          truncated ||
          ignored?.stdoutTruncated === true ||
          exclusions.length > 0 ||
          (ignored?.stdout ?? "")
            .split("\0")
            .some(
              (entry) => entry !== "" && !isMetadata(entry) && !/(^|\/)node_modules\/$/.test(entry),
            ),
      };
    }),
  );
});
