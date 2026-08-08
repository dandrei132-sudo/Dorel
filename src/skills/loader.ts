import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSkillManifest, type SkillManifest } from "./format.js";

export interface LoadedSkill {
  manifest: SkillManifest;
  manifestPath: string;
  dir: string;
}

/**
 * Scans a directory of skill folders, each containing a skill.json
 * manifest, and returns the parsed, valid ones. Invalid manifests are
 * skipped with a warning rather than crashing the whole loader — one bad
 * skill shouldn't take down agent startup.
 */
export function loadSkillsFromDir(skillsDir: string): LoadedSkill[] {
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );

  const loaded: LoadedSkill[] = [];
  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.name);
    const manifestPath = path.join(dir, "skill.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const manifest = parseSkillManifest(raw);
      loaded.push({ manifest, manifestPath, dir });
    } catch (err) {
      console.warn(
        `[skills] skipping invalid manifest at ${manifestPath}: ${(err as Error).message}`,
      );
    }
  }
  return loaded;
}
