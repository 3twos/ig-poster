import { mkdir, readFile, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const ProjectDefaultsSchema = z.object({
  brandKitId: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
  json: z.boolean().optional(),
});

const CliProjectLinkSchema = z.object({
  host: z.string().url().optional(),
  profile: z.string().min(1).optional(),
  defaults: ProjectDefaultsSchema.optional(),
});

export type CliProjectLink = z.infer<typeof CliProjectLinkSchema>;

export type LoadedProjectLink = {
  rootDir: string;
  configPath: string;
  config: CliProjectLink;
};

const PROJECT_DIR_NAME = ".ig-poster";
const PROJECT_FILE_NAME = "project.json";

export const getProjectLinkPath = (rootDir: string) =>
  path.join(rootDir, PROJECT_DIR_NAME, PROJECT_FILE_NAME);

export const loadProjectLinkAtDir = async (
  rootDir: string,
): Promise<LoadedProjectLink | null> => {
  const configPath = getProjectLinkPath(rootDir);

  try {
    const raw = await readFile(configPath, "utf8");
    return {
      rootDir,
      configPath,
      config: CliProjectLinkSchema.parse(JSON.parse(raw)),
    };
  } catch (error) {
    const nodeError =
      error instanceof Error
        ? (error as Error & { code?: string })
        : { code: undefined };
    if (nodeError.code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

export const loadProjectLink = async (
  startDir: string = process.cwd(),
): Promise<LoadedProjectLink | null> => {
  let currentDir = path.resolve(startDir);

  while (true) {
    const linked = await loadProjectLinkAtDir(currentDir);
    if (linked) {
      return linked;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
};

export const saveProjectLink = async (
  rootDir: string,
  projectLink: CliProjectLink,
): Promise<LoadedProjectLink> => {
  const configPath = getProjectLinkPath(rootDir);
  const normalized = CliProjectLinkSchema.parse(projectLink);

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return {
    rootDir,
    configPath,
    config: normalized,
  };
};

export const removeProjectLink = async (
  startDir: string = process.cwd(),
): Promise<LoadedProjectLink | null> => {
  const linked = await loadProjectLink(startDir);
  if (!linked) {
    return null;
  }

  await unlink(linked.configPath);

  try {
    const entries = await readdir(path.dirname(linked.configPath));
    if (entries.length === 0) {
      await rmdir(path.dirname(linked.configPath));
    }
  } catch {
    // Best-effort cleanup only. Ignore directory races and non-empty folders.
  }

  return linked;
};
