// @effect-diagnostics nodeBuiltinImport:off - Native signing shares Promise-based I/O with @electron/osx-sign.

import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as Config from "effect/Config";
import * as Redacted from "effect/Redacted";

import sign from "./sign-macos.ts";

export interface LocalMacSigningCredentials {
  readonly certificate: Redacted.Redacted<string>;
  readonly password: Redacted.Redacted<string>;
  readonly identity: string;
}

export const LocalMacSigningCredentialsConfig = Config.all({
  certificate: Config.Redacted("T3CODE_MACOS_CERTIFICATE_BASE64"),
  password: Config.Redacted("T3CODE_MACOS_CERTIFICATE_PASSWORD"),
  identity: Config.String("T3CODE_MACOS_SIGNING_IDENTITY"),
});

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);

// security errors include their arguments, which can contain certificate passwords.
async function runSecurity(args: readonly string[]): Promise<string> {
  try {
    const result = await execFile("/usr/bin/security", args);
    return result.stdout;
  } catch {
    throw new Error(`macOS security ${args[0]} failed.`);
  }
}

// A disposable keychain keeps the private key out of the login keychain and app bundle.
export async function signLocalMacApplication(
  app: string,
  credentials: LocalMacSigningCredentials,
): Promise<void> {
  if (!/^[A-Fa-f0-9]{40}$/.test(credentials.identity)) {
    throw new Error("T3CODE_MACOS_SIGNING_IDENTITY must be a certificate SHA-1 fingerprint.");
  }

  const scratch: string = await NodeFSP.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "t3-macos-signing-"),
  );
  const certificatePath: string = NodePath.join(scratch, "certificate.p12");
  const keychainPath: string = NodePath.join(scratch, "signing.keychain-db");
  const password: string = Redacted.value(credentials.password);
  let keychainCreated: boolean = false;

  try {
    await NodeFSP.writeFile(
      certificatePath,
      Buffer.from(Redacted.value(credentials.certificate), "base64"),
      { mode: 0o600 },
    );
    await runSecurity(["create-keychain", "-p", password, keychainPath]);
    keychainCreated = true;
    await runSecurity(["unlock-keychain", "-p", password, keychainPath]);
    await runSecurity([
      "import",
      certificatePath,
      "-k",
      keychainPath,
      "-P",
      password,
      "-T",
      "/usr/bin/codesign",
    ]);
    await runSecurity([
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:,codesign:",
      "-s",
      "-k",
      password,
      keychainPath,
    ]);

    // codesign needs the certificate's keychain in the search list even with --keychain.
    const searchList: string = await runSecurity(["list-keychains", "-d", "user"]);
    const keychains: string[] = searchList
      .split("\n")
      .map((line: string): string => line.trim().replace(/^"|"$/g, ""))
      .filter((line: string): boolean => line.length > 0);
    if (!keychains.includes(keychainPath)) {
      await runSecurity(["list-keychains", "-d", "user", "-s", keychainPath, ...keychains]);
    }

    await sign({
      app,
      identity: credentials.identity,
      keychain: keychainPath,
      platform: "darwin",
      identityValidation: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
    });
  } finally {
    try {
      if (keychainCreated) {
        // Deleting only our keychain preserves concurrent changes to the search list.
        await runSecurity(["delete-keychain", keychainPath]);
      }
    } finally {
      await NodeFSP.rm(scratch, { recursive: true, force: true });
    }
  }
}
