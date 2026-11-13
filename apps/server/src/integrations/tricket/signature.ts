import * as Effect from "effect/Effect";
import * as Mac from "effect/crypto/Mac";
import * as Base64 from "effect/encoding/Base64";
import * as Result from "effect/Result";

export const verifySignature = Effect.fn("Tricket.verifySignature")(function* (input: {
  readonly secret: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: Uint8Array;
  readonly now: number;
}) {
  const id = input.headers["webhook-id"];
  const timestamp = input.headers["webhook-timestamp"];
  const signatures = input.headers["webhook-signature"];
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(input.now / 1000 - Number(timestamp)) > 300) return false;
  const decodedKey = Base64.decode(input.secret.replace(/^whsec_/, ""));
  if (Result.isFailure(decodedKey) || decodedKey.success.length !== 32) return false;
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const signed = new Uint8Array(prefix.length + input.body.length);
  signed.set(prefix);
  signed.set(input.body, prefix.length);
  const mac = yield* Mac.Mac;
  const key = yield* Mac.key(Mac.hmacSha256, decodedKey.success);
  return yield* Effect.forEach(signatures.split(/\s+/), (signature) => {
    const [version, encoded] = signature.split(",");
    if (version !== "v1" || encoded === undefined) return Effect.succeed(false);
    const tag = Base64.decode(encoded);
    return Result.isFailure(tag)
      ? Effect.succeed(false)
      : mac.verify(key, tag.success, signed).pipe(Effect.orElseSucceed(() => false));
  }).pipe(Effect.map((results) => results.some(Boolean)));
});
