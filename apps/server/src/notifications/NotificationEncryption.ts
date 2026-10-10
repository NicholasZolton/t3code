import { fitFcmData } from "@t3tools/shared/agentActivityAndroid";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

export class NotificationWebCrypto extends Context.Service<
  NotificationWebCrypto,
  { readonly subtle: typeof globalThis.crypto.subtle }
>()("t3/notifications/NotificationEncryption/NotificationWebCrypto") {}

export class NotificationEncryptionError extends Schema.TaggedError<NotificationEncryptionError>()(
  "NotificationEncryptionError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not encrypt the paired notification.";
  }
}

export class NotificationEncryption extends Context.Service<
  NotificationEncryption,
  {
    readonly validatePublicKey: (
      publicKey: string,
    ) => Effect.Effect<void, NotificationEncryptionError>;
    readonly seal: (input: {
      readonly publicKey: string;
      readonly registrationId: string;
      readonly messageId: string;
      readonly data: Readonly<Record<string, string>>;
    }) => Effect.Effect<Record<string, string>, NotificationEncryptionError>;
  }
>()("t3/notifications/NotificationEncryption") {}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

const encodeData = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);

const make = Effect.gen(function* () {
  const { subtle } = yield* NotificationWebCrypto;
  const crypto = yield* Crypto.Crypto;
  const importPublicKey = (publicKey: string): ReturnType<typeof subtle.importKey> =>
    subtle.importKey(
      "spki",
      Uint8Array.from(atob(publicKey), (character) => character.charCodeAt(0)),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );

  return NotificationEncryption.of({
    validatePublicKey: (publicKey) =>
      Effect.tryPromise({
        try: async () => {
          await importPublicKey(publicKey);
        },
        catch: (cause) => new NotificationEncryptionError({ cause }),
      }),
    // Only the envelope reaches FCM. The matching private key never leaves Android.
    seal: Effect.fn("NotificationEncryption.seal")(function* (input) {
      const nonce = yield* crypto
        .randomBytes(12)
        .pipe(Effect.mapError((cause) => new NotificationEncryptionError({ cause })));
      return yield* Effect.tryPromise({
        try: async () => {
          const encoder = new TextEncoder();
          const binding = encoder.encode(
            ["paired_activity_v1", input.registrationId, input.messageId].join("\n"),
          );
          const recipient = await importPublicKey(input.publicKey);
          const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
            "deriveBits",
          ]);
          const shared = await subtle.deriveBits(
            { name: "ECDH", public: recipient },
            ephemeral.privateKey,
            256,
          );
          const material = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
          const key = await subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(nonce), info: binding },
            material,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt"],
          );
          // Base64 and the public envelope also consume FCM's 4 KB budget.
          const plaintext = encoder.encode(encodeData(fitFcmData(input.data, 2400)));
          const ciphertext = await subtle.encrypt(
            { name: "AES-GCM", iv: new Uint8Array(nonce), additionalData: binding, tagLength: 128 },
            key,
            plaintext,
          );
          const envelope = {
            t3_kind: "paired_activity_v1",
            registration_id: input.registrationId,
            message_id: input.messageId,
            ephemeral_key: base64(
              new Uint8Array(await subtle.exportKey("spki", ephemeral.publicKey)),
            ),
            nonce: base64(nonce),
            ciphertext: base64(new Uint8Array(ciphertext)),
          };
          if (encoder.encode(encodeData(envelope)).length > 3800) {
            throw new Error("Encrypted notification exceeds the FCM payload budget.");
          }
          return envelope;
        },
        catch: (cause) => new NotificationEncryptionError({ cause }),
      });
    }),
  });
});

export const layer = Layer.effect(NotificationEncryption, make);
