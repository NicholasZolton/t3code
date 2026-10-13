import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";

import { SourceControlProviderKind, type ServerSettingsError } from "@t3tools/contracts";
import * as SourceControlProvider from "@t3tools/source-control-core/server/SourceControlProvider";

import * as ServerConfig from "../config.ts";
import * as GitManager from "../git/GitManager.ts";
import * as ProjectSetupScriptRunner from "../project/ProjectSetupScriptRunner.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as SourceControlProviderRegistry from "../sourceControl/SourceControlProviderRegistry.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import {
  describeJj,
  JjDriverLayer,
  runGit,
  runJj,
  seedJjRepo,
} from "../vcs/testing/JjTestSupport.ts";
import * as JjWorkflow from "./JjWorkflow.ts";

interface CreatedPullRequest {
  readonly baseRefName: string;
  readonly cwd: string;
}

function workflowLayer(
  created: Array<CreatedPullRequest>,
): Layer.Layer<
  JjWorkflow.JjWorkflow | FileSystem.FileSystem | Path.Path,
  PlatformError.PlatformError | ServerSettingsError
> {
  const providerLayer = Layer.mock(SourceControlProvider.SourceControlProvider)({
    kind: SourceControlProviderKind.make("github"),
    headBranchProbe: ({ headSelectors }) => ({ headSelectors, limit: 1 }),
    listChangeRequests: () => Effect.succeed([]),
    getDefaultBranch: () => Effect.succeed("main"),
    readChangeRequestTemplate: () => Effect.succeedNone,
    createChangeRequest: (input) =>
      Effect.sync(() => {
        created.push({ baseRefName: input.baseRefName, cwd: input.cwd });
      }),
  });

  return JjWorkflow.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        ServerConfig.layerTest(process.cwd(), { prefix: "t3-jj-workflow-config-" }),
        ServerSettings.layerTest(),
        Layer.mock(GitManager.GitManager)({}),
        Layer.mock(ProjectSetupScriptRunner.ProjectSetupScriptRunner)({}),
        Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
        Layer.mock(TextGeneration.TextGeneration)({
          generatePrContent: () => Effect.succeed({ title: "Add the change", body: "Body" }),
        }),
        Layer.mock(SourceControlProviderRegistry.SourceControlProviderRegistry)({
          resolveLink: () => undefined,
          resolve: () =>
            SourceControlProvider.SourceControlProvider.pipe(Effect.provide(providerLayer)),
        }),
      ).pipe(Layer.provideMerge(JjDriverLayer)),
    ),
  );
}

describeJj("JjWorkflow pull request bases", () => {
  it.effect.each([
    { baseRef: "release/v2", remoteOnly: false, expected: "release/v2" },
    { baseRef: "refs/heads/release/v2", remoteOnly: false, expected: "release/v2" },
    { baseRef: "origin/release/v2", remoteOnly: true, expected: "release/v2" },
    { baseRef: "refs/remotes/origin/release/v2", remoteOnly: true, expected: "release/v2" },
    { baseRef: "release/v2", remoteOnly: true, expected: "release/v2" },
    { baseRef: "HEAD~1", remoteOnly: false, expected: "main" },
    { baseRef: "commit-id", remoteOnly: false, expected: "main" },
  ])("creates a PR from a linked workspace with saved base $baseRef", (scenario) => {
    const created: Array<CreatedPullRequest> = [];

    return Effect.gen(function* () {
      const { base, root } = yield* seedJjRepo({
        prefix: "t3-jj-workflow-",
        withRemote: true,
      });
      const fileSystem: FileSystem.FileSystem = yield* FileSystem.FileSystem;
      const path: Path.Path = yield* Path.Path;
      const workflow: JjWorkflow.JjWorkflow["Service"] = yield* JjWorkflow.JjWorkflow;
      yield* runJj(root, ["bookmark", "create", "release/v2", "-r", "main"]);
      yield* runJj(root, ["git", "push", "--bookmark", "release/v2", "--remote", "origin"]);
      const baseCommit: string = (yield* runJj(root, [
        "log",
        "-r",
        "main",
        "--no-graph",
        "-T",
        "commit_id",
      ])).trim();
      const branch: string = "feature/configured-base";
      const workspace = yield* workflow.createWorktree({
        cwd: root,
        refName: "release/v2",
        newRefName: branch,
        path: path.join(base, "thread"),
      });
      const cwd: string = workspace.worktree.path;
      yield* fileSystem.writeFileString(path.join(cwd, "feature.txt"), "feature\n");
      yield* runJj(cwd, ["commit", "-m", "Add the change"]);
      yield* runJj(cwd, ["bookmark", "set", branch, "-r", "@-"]);
      if (scenario.remoteOnly) {
        yield* runJj(root, ["bookmark", "delete", "release/v2"]);
      }
      yield* runGit(root, [
        "config",
        `branch.${branch}.gh-merge-base`,
        scenario.baseRef === "commit-id" ? baseCommit : scenario.baseRef,
      ]);

      const result = yield* workflow.runStackedAction({
        cwd,
        actionId: "create-pr",
        action: "create_pr",
      });

      assert.equal(result.pr.status, "created");
      assert.equal(result.pr.baseBranch, scenario.expected);
      assert.deepStrictEqual(created, [{ baseRefName: scenario.expected, cwd: root }]);
    }).pipe(Effect.provide(workflowLayer(created)));
  });
});
