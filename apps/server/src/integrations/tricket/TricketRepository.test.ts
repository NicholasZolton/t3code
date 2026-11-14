import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { DEFAULT_TRICKET_SETTINGS, ThreadId } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import * as TricketRepository from "./TricketRepository.ts";

it.effect(
  "keeps accepted deliveries and handoff progress across database reopen, without reopening completed duplicates",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "tricket-durable-" });
      const database = path.join(directory, "tricket.sqlite");
      const settings = { ...DEFAULT_TRICKET_SETTINGS, apiUrl: "https://tricket.example.com" };
      const handoff: TricketRepository.Handoff = {
        id: "handoff",
        issueId: "issue",
        identifier: "TRI-1",
        threadId: ThreadId.make("thread"),
        actorId: null,
        status: "reserved",
        settings,
        updates: { sequence: 42, message: "Persisted external ticket changes" },
      };
      const layer = TricketRepository.layer.pipe(
        Layer.provideMerge(NodeSqliteClient.layer({ filename: database })),
      );
      const member: TricketRepository.Member = {
        id: "member",
        threadId: handoff.threadId,
        apiUrl: settings.apiUrl,
        actorId: "agent",
      };
      const lead: TricketRepository.Handoff = {
        id: "lead",
        resource: "project",
        projectId: "project",
        identifier: "P-1",
        threadId: handoff.threadId,
        actorId: member.actorId,
        status: "running",
        managed: false,
        settings,
      };
      yield* Effect.gen(function* () {
        const repository = yield* TricketRepository.TricketRepository;
        yield* repository.saveSettings(settings);
        yield* repository.accept(settings.apiUrl, "event", handoff.issueId);
        yield* repository.saveHandoff(handoff);
        yield* repository.saveMember(member);
        yield* repository.saveHandoff(lead);
      }).pipe(Effect.provide(Layer.fresh(layer)));
      yield* Effect.gen(function* () {
        const repository = yield* TricketRepository.TricketRepository;
        expect(yield* repository.settings).toEqual(settings);
        expect(yield* repository.handoffs).toEqual([lead, handoff]);
        expect(yield* repository.members).toEqual([member]);
        const sql = yield* SqlClient.SqlClient;
        expect((yield* sql`SELECT id FROM tricket_handoffs`).map((row) => row.id)).toEqual([
          handoff.id,
        ]);
        expect(yield* repository.pending(settings.apiUrl)).toEqual([
          { eventId: "event", issueId: "issue" },
        ]);
        yield* repository.complete(settings.apiUrl, handoff.issueId);
        yield* repository.accept(settings.apiUrl, "event", handoff.issueId);
        expect(yield* repository.pending(settings.apiUrl)).toEqual([]);
        yield* repository.accept("https://other.example.com", "event", handoff.issueId);
        expect(yield* repository.pending("https://other.example.com")).toHaveLength(1);
        expect(yield* repository.pending(settings.apiUrl)).toEqual([]);
      }).pipe(Effect.provide(Layer.fresh(layer)));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
