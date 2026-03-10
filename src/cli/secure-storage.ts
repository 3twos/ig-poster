import { spawn } from "node:child_process";

import type { CliConfig, CliProfileConfig } from "./config";

const KEYCHAIN_SERVICE = "ig-poster-cli-refresh-token";
const SECURITY_BIN = "/usr/bin/security";
const EXPECT_BIN = "/usr/bin/expect";
const KEYCHAIN_ITEM_NOT_FOUND_PATTERN =
  /errSecItemNotFound|could not be found|item[\s\S]*not found/iu;
const PROMPTED_COMMAND_EXPECT_SCRIPT = `
set timeout -1
log_user 0
set secret [read stdin]
regsub {\\r?\\n$} $secret {} secret
spawn {*}$argv
send -- "$secret\\r"
expect eof
set child_output $expect_out(buffer)
lassign [wait] pid spawnid os_error exit_status
if {$os_error != 0 || $exit_status != 0} {
  puts -nonewline stderr $child_output
  exit [expr {$os_error != 0 ? $os_error : $exit_status}]
}
`.trim();

export type SecureStorageCommandRunner = (params: {
  command?: string;
  args: string[];
  stdin?: string;
}) => Promise<{ stdout: string; stderr: string }>;

type SecureStorageOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  run?: SecureStorageCommandRunner;
};

const defaultSecurityRunner: SecureStorageCommandRunner = async ({
  command = SECURITY_BIN,
  args,
  stdin,
}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const message = stderr.trim() || `security exited with code ${code ?? 1}`;
      reject(
        Object.assign(new Error(message), {
          code,
          stdout,
          stderr,
        }),
      );
    });

    child.stdin.end(stdin);
  });

const isKeychainEnabled = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
) => platform === "darwin" && env.IG_POSTER_DISABLE_KEYCHAIN !== "1";

const canonicalizeHost = (host: string) => {
  const normalized = host.trim();

  try {
    return new URL(normalized).origin;
  } catch {
    return normalized.toLowerCase().replace(/\/+$/u, "");
  }
};

const buildAccountName = (profileName: string, host: string) =>
  `${profileName}@${canonicalizeHost(host)}`;

const getSecurityErrorText = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stderr =
    "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";

  return [stderr, message].filter(Boolean).join("\n").trim();
};

const isKeychainItemNotFoundError = (error: unknown) =>
  KEYCHAIN_ITEM_NOT_FOUND_PATTERN.test(getSecurityErrorText(error));

export const loadStoredRefreshToken = async (
  profileName: string,
  host: string,
  options: SecureStorageOptions = {},
) => {
  if (!isKeychainEnabled(options.env, options.platform)) {
    return undefined;
  }

  const run = options.run ?? defaultSecurityRunner;
  try {
    const { stdout } = await run({
      args: [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        buildAccountName(profileName, host),
        "-w",
      ],
    });
    const token = stdout.trim();
    return token || undefined;
  } catch (error) {
    if (isKeychainItemNotFoundError(error)) {
      return undefined;
    }

    throw new Error(
      "Failed to load refresh token from macOS Keychain. Unlock the keychain, allow the `security` CLI to access it, or set IG_POSTER_DISABLE_KEYCHAIN=1 to use config-file storage instead.",
    );
  }
};

export const saveStoredRefreshToken = async (
  profileName: string,
  host: string,
  refreshToken: string,
  options: SecureStorageOptions = {},
) => {
  if (!isKeychainEnabled(options.env, options.platform)) {
    return false;
  }

  const run = options.run ?? defaultSecurityRunner;
  try {
    await run({
      command: EXPECT_BIN,
      args: [
        "-c",
        PROMPTED_COMMAND_EXPECT_SCRIPT,
        SECURITY_BIN,
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        buildAccountName(profileName, host),
        "-w",
      ],
      stdin: `${refreshToken}\n`,
    });
    return true;
  } catch {
    return false;
  }
};

export const clearStoredRefreshToken = async (
  profileName: string,
  host: string,
  options: SecureStorageOptions = {},
) => {
  if (!isKeychainEnabled(options.env, options.platform)) {
    return false;
  }

  const run = options.run ?? defaultSecurityRunner;
  try {
    await run({
      args: [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        buildAccountName(profileName, host),
      ],
    });
    return true;
  } catch {
    return false;
  }
};

export const resolveProfileConfigSecrets = async (
  config: CliConfig,
  profileName: string,
  host: string,
  options: SecureStorageOptions = {},
): Promise<CliProfileConfig> => {
  const profile = config.profiles[profileName] ?? {};
  const matchesResolvedHost =
    !profile.host || canonicalizeHost(profile.host) === canonicalizeHost(host);

  let baseProfile = profile;
  if (profile.refreshToken && !matchesResolvedHost) {
    const profileWithoutRefreshToken = { ...profile };
    delete profileWithoutRefreshToken.refreshToken;
    baseProfile = profileWithoutRefreshToken;
  } else if (profile.refreshToken) {
    return profile;
  }

  const refreshToken = await loadStoredRefreshToken(profileName, host, options);
  if (!refreshToken) {
    return baseProfile;
  }

  return {
    ...baseProfile,
    refreshToken,
  };
};
