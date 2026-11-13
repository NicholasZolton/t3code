// @effect-diagnostics-next-line nodeBuiltinImport:off -- Node HMAC is an independent oracle for the Effect verifier.
import * as NodeCrypto from "node:crypto";
import * as NodePlatformCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { verifySignature } from "./signature.ts";

const key = Buffer.alloc(32, 7);
const secret = `whsec_${key.toString("base64")}`;
const body = new TextEncoder().encode('{"title":"café"}');
const timestamp = "1800000000";
const id = "d86e0000-0000-4000-8000-000000000001";
const headers = {
  "webhook-id": id,
  "webhook-timestamp": timestamp,
  "webhook-signature": `v1,${NodeCrypto.createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest("base64")}`,
};

it.effect(
  "verifies raw Standard Webhooks bytes and rejects tampering, stale/future timestamps, and malformed keys",
  () =>
    Effect.gen(function* () {
      const valid = { secret, headers, body, now: Number(timestamp) * 1000 };
      expect(yield* verifySignature(valid)).toBe(true);
      expect(
        yield* verifySignature({
          ...valid,
          headers: {
            ...headers,
            "webhook-signature": `v2,ignored ${headers["webhook-signature"]}`,
          },
        }),
      ).toBe(true);
      const invalid = [
        { ...valid, body: new TextEncoder().encode('{"title":"cafe"}') },
        { ...valid, headers: { ...headers, "webhook-id": "other" } },
        { ...valid, now: valid.now + 301_000 },
        { ...valid, now: valid.now - 301_000 },
        { ...valid, headers: { ...headers, "webhook-timestamp": "1e9" } },
        { ...valid, headers: {} },
        { ...valid, secret: "whsec_invalid" },
        { ...valid, headers: { ...headers, "webhook-signature": "v1,bad" } },
      ];
      expect(yield* Effect.forEach(invalid, verifySignature)).toEqual(invalid.map(() => false));
    }).pipe(Effect.provide(NodePlatformCrypto.layerMac)),
);
