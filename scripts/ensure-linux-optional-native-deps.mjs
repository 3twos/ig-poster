import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const resolveLinuxTargetSuffix = () => {
  if (process.platform !== "linux") {
    return null;
  }

  if (process.arch === "arm") {
    return "linux-arm-gnueabihf";
  }

  if (process.arch !== "x64" && process.arch !== "arm64") {
    return null;
  }

  const report = process.report?.getReport?.();
  const glibcVersion = report?.header?.glibcVersionRuntime;
  const libc = glibcVersion ? "gnu" : "musl";

  return `linux-${process.arch}-${libc}`;
};

const loadLockfile = () => {
  const lockfilePath = join(repoRoot, "package-lock.json");
  return JSON.parse(readFileSync(lockfilePath, "utf8"));
};

const collectMissingPackages = (targetSuffix) => {
  const lockfile = loadLockfile();
  const resolved = new Map();

  for (const pkg of Object.values(lockfile.packages ?? {})) {
    if (!pkg || typeof pkg !== "object") {
      continue;
    }

    const optionalDependencies =
      "optionalDependencies" in pkg &&
      pkg.optionalDependencies &&
      typeof pkg.optionalDependencies === "object"
        ? pkg.optionalDependencies
        : null;

    if (!optionalDependencies) {
      continue;
    }

    for (const [name, version] of Object.entries(optionalDependencies)) {
      if (!name.endsWith(targetSuffix)) {
        continue;
      }

      if (typeof version !== "string" || version.trim() === "") {
        continue;
      }

      resolved.set(name, version);
    }
  }

  return [...resolved.entries()].filter(([name]) => {
    return !existsSync(join(repoRoot, "node_modules", name));
  });
};

const installPackages = (packages) => {
  if (packages.length === 0) {
    return;
  }

  const specs = packages.map(([name, version]) => `${name}@${version}`);
  console.log(`Installing missing Linux native optional deps: ${specs.join(", ")}`);

  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const args = npmExecPath
    ? [npmExecPath, "install", "--no-save", "--ignore-scripts", ...specs]
    : ["install", "--no-save", "--ignore-scripts", ...specs];

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
};

const targetSuffix = resolveLinuxTargetSuffix();
if (!targetSuffix) {
  process.exit(0);
}

installPackages(collectMissingPackages(targetSuffix));
