// @effect-diagnostics nodeBuiltinImport:off - Exercise native signing with isolated keychains and OpenSSL.

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as Redacted from "effect/Redacted";
import { expect, it } from "vite-plus/test";

import { signLocalMacApplication, type LocalMacSigningCredentials } from "./sign-local-macos.ts";

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);

// oxlint-disable-next-line t3code/no-global-process-runtime -- This integration test needs the actual host's macOS security tools.
it.skipIf(NodeOS.platform() !== "darwin")(
  "keeps a certificate-bound identity across changed app builds and rejects a wrong password",
  async () => {
    const scratch: string = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-signing-test-"),
    );
    const password: string = NodeCrypto.randomBytes(32).toString("base64");
    const certificatePath: string = NodePath.join(scratch, "certificate.pem");
    const privateKeyPath: string = NodePath.join(scratch, "key.pem");
    const archivePath: string = NodePath.join(scratch, "certificate.p12");
    const configPath: string = NodePath.join(scratch, "openssl.cnf");
    const app: string = NodePath.join(scratch, "Signing Test.app");

    try {
      await NodeFSP.writeFile(
        configPath,
        `[req]
distinguished_name = subject
x509_extensions = code_signing
prompt = no
[subject]
CN = T3 Code Signing Test
[code_signing]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
`,
      );
      await execFile("openssl", [
        "req",
        "-new",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-x509",
        "-sha256",
        "-days",
        "1",
        "-config",
        configPath,
        "-out",
        certificatePath,
        "-keyout",
        privateKeyPath,
      ]);
      await execFile(
        "openssl",
        [
          "pkcs12",
          "-export",
          "-inkey",
          privateKeyPath,
          "-in",
          certificatePath,
          "-out",
          archivePath,
          "-passout",
          "env:T3_SIGNING_TEST_PASSWORD",
          "-keypbe",
          "PBE-SHA1-3DES",
          "-certpbe",
          "PBE-SHA1-3DES",
          "-macalg",
          "sha1",
        ],
        { env: { T3_SIGNING_TEST_PASSWORD: password } },
      );

      const certificate: NodeCrypto.X509Certificate = new NodeCrypto.X509Certificate(
        await NodeFSP.readFile(certificatePath),
      );
      const credentials: LocalMacSigningCredentials = {
        certificate: Redacted.make((await NodeFSP.readFile(archivePath)).toString("base64")),
        password: Redacted.make(password),
        identity: certificate.fingerprint.replaceAll(":", ""),
      };
      await NodeFSP.mkdir(NodePath.join(app, "Contents", "MacOS"), { recursive: true });
      await NodeFSP.mkdir(NodePath.join(app, "Contents", "Resources"));
      await NodeFSP.copyFile("/usr/bin/true", NodePath.join(app, "Contents", "MacOS", "test"));
      await NodeFSP.writeFile(
        NodePath.join(app, "Contents", "Info.plist"),
        `<?xml version="1.0"?><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.t3tools.signing-test</string>
<key>CFBundleExecutable</key><string>test</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>`,
      );

      await signLocalMacApplication(app, credentials);
      const first: { requirement: string; hash: string } = await readSignature(app);
      expect(first.requirement).toContain(credentials.identity.toLowerCase());
      expect(first.requirement).not.toContain("cdhash");

      await NodeFSP.writeFile(
        NodePath.join(app, "Contents", "Resources", "version"),
        "second build",
      );
      await signLocalMacApplication(app, credentials);
      const second: { requirement: string; hash: string } = await readSignature(app);
      expect(second.requirement).toBe(first.requirement);
      expect(second.hash).not.toBe(first.hash);
      await execFile("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);

      const wrongPassword: string = "intentionally-wrong-certificate-password";
      await expect(
        signLocalMacApplication(app, {
          ...credentials,
          password: Redacted.make(wrongPassword),
        }),
      ).rejects.toThrow(/^macOS security import failed\.$/);
    } finally {
      await NodeFSP.rm(scratch, { recursive: true, force: true });
    }
  },
);

async function readSignature(app: string): Promise<{ requirement: string; hash: string }> {
  const result = await execFile("/usr/bin/codesign", ["-d", "-r-", "--verbose=4", app]);
  const output: string = result.stdout + result.stderr;
  const requirement: string | undefined = output.match(/^designated => (.+)$/m)?.[1];
  const hash: string | undefined = output.match(/^CDHash=(.+)$/m)?.[1];
  if (!requirement || !hash) {
    throw new Error("codesign did not return the app's identity and code hash.");
  }
  return { requirement, hash };
}
