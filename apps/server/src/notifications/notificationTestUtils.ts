// @effect-diagnostics-next-line nodeBuiltinImport:off -- Independent crypto primitives verify interoperability, not a copy of the sender.
import * as NodeCrypto from "node:crypto";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as NotificationEncryption from "./NotificationEncryption.ts";

const decodeData = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

export function makePhoneKey(): {
  readonly privateKey: NodeCrypto.KeyObject;
  readonly publicKey: string;
} {
  const pair = NodeCrypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

// Independent Node primitives also verify interoperability with the WebCrypto sender.
export function openNotification(
  envelope: Readonly<Record<string, string>>,
  privateKey: NodeCrypto.KeyObject,
): Record<string, string> {
  const publicKey = NodeCrypto.createPublicKey({
    key: Buffer.from(envelope.ephemeral_key!, "base64"),
    type: "spki",
    format: "der",
  });
  const shared = NodeCrypto.diffieHellman({ privateKey, publicKey });
  const nonce = Buffer.from(envelope.nonce!, "base64");
  const binding = Buffer.from(
    [envelope.t3_kind, envelope.registration_id, envelope.message_id].join("\n"),
  );
  const key = NodeCrypto.hkdfSync("sha256", shared, nonce, binding, 32);
  const sealed = Buffer.from(envelope.ciphertext!, "base64");
  const cipher = NodeCrypto.createDecipheriv("aes-256-gcm", new Uint8Array(key), nonce);
  cipher.setAAD(binding);
  cipher.setAuthTag(sealed.subarray(-16));
  return decodeData(
    Buffer.concat([cipher.update(sealed.subarray(0, -16)), cipher.final()]).toString("utf8"),
  );
}

export const encryptionLayer = NotificationEncryption.layer.pipe(
  Layer.provide(
    Layer.succeed(NotificationEncryption.NotificationWebCrypto, {
      subtle: globalThis.crypto.subtle,
    }),
  ),
);
