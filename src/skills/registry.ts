import { getDb } from "../state/db.js";
import { loadSkillsFromDir, type LoadedSkill } from "./loader.js";

export class SkillRegistry {
  private skills = new Map<string, LoadedSkill>();

  loadFrom(skillsDir: string): LoadedSkill[] {
    const found = loadSkillsFromDir(skillsDir);
    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO skills (name, version, manifest_path, enabled)
       VALUES (@name, @version, @manifestPath, 1)
       ON CONFLICT(name) DO UPDATE SET
         version = excluded.version,
         manifest_path = excluded.manifest_path,
         loaded_at = datetime('now')`,
    );
    for (const skill of found) {
      this.skills.set(skill.manifest.name, skill);
      upsert.run({
        name: skill.manifest.name,
        version: skill.manifest.version,
        manifestPath: skill.manifestPath,
      });
    }
    return found;
  }

  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  list(): LoadedSkill[] {
    return [...this.skills.values()];
  }
}
