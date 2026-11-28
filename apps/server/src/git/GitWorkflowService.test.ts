import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitManager from "./GitManager.ts";
import * as GitWorkflowService from "./GitWorkflowService.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";

it.layer(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))("GitWorkflowService", (it) => {
  const liveWorkflow = GitWorkflowService.layer.pipe(
    Layer.provide(Layer.mock(GitManager.GitManager)({})),
    Layer.provideMerge(
      Layer.merge(GitVcsDriver.layer, VcsDriverRegistry.layer).pipe(
        Layer.provideMerge(VcsProcess.layer),
        Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-git-workflow-" })),
        Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
      ),
    ),
  );

  it.effect("finds a name among the refs of every namespace", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-ref-named-" });
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const driver = yield* GitVcsDriver.GitVcsDriver;
      for (const args of [
        ["init", "-b", "main"],
        ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"],
        ["update-ref", "refs/remotes/upstream/feature/topic", "HEAD"],
        ["symbolic-ref", "refs/remotes/origin/alias", "refs/heads/main"],
        ["update-ref", "refs/mirror/origin/mirrored", "HEAD"],
      ]) {
        yield* driver.execute({ operation: "test.setupRepo", cwd, args });
      }
      const found = yield* Effect.forEach(
        ["main", "feature/topic", "alias", "mirrored", "t3/renamed", "feature/*"],
        (refName) => workflow.hasRefNamed({ cwd, refName }),
      );
      assert.deepEqual(found, [true, true, true, true, false, false]);
    }).pipe(Effect.provide(liveWorkflow)),
  );

  it.effect("does not recreate a missing worktree recorded as Jujutsu", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.realPath(
        yield* fs.makeTempDirectoryScoped({ prefix: "t3-retired-jj-" }),
      );
      const target = path.join(cwd, "legacy-workspace");
      const driver = yield* GitVcsDriver.GitVcsDriver;
      yield* driver.execute({ operation: "test.setupRepo", cwd, args: ["init", "-b", "main"] });
      const digest = yield* Effect.promise(() =>
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(target)),
      );
      yield* driver.execute({
        operation: "test.recordWorkspaceOwner",
        cwd,
        args: [
          "config",
          "--local",
          `t3.workspace-${Buffer.from(digest).toString("hex")}.kind`,
          "jj",
        ],
      });

      const workflow = yield* GitWorkflowService.GitWorkflowService;
      const failure = yield* workflow
        .ensureWorkspace({ cwd, path: target, refName: "main" })
        .pipe(Effect.flip);
      assert.match(failure.message, /Jujutsu/);
      assert.isFalse(yield* fs.exists(target));
    }).pipe(Effect.provide(liveWorkflow)),
  );

  it.effect("reads no HEAD path from a removed worktree without spawning Git", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const parent = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-removed-wt-" });
      const removed = `${parent}/removed`;
      const workflow = yield* GitWorkflowService.GitWorkflowService;
      assert.strictEqual(yield* workflow.headPath(removed), null);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        GitWorkflowService.layer.pipe(
          Layer.provide(Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({})),
          Layer.provide(Layer.mock(GitManager.GitManager)({})),
          Layer.provide(
            Layer.mock(GitVcsDriver.GitVcsDriver)({
              execute: (input) => Effect.die(`spawned Git in ${input.cwd}`),
            }),
          ),
        ),
      ),
    ),
  );
});
