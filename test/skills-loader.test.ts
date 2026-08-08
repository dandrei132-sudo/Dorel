import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSkillsFromDir } from "../src/skills/loader.js";

describe("loadSkillsFromDir", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "automaton-skills-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads a valid skill manifest", () => {
    const skillDir = path.join(dir, "greeter");
    mkdirSync(skillDir);
    writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({
        name: "greeter",
        version: "1.0.0",
        description: "says hello",
        entrypoint: "index.js",
      }),
    );

    const loaded = loadSkillsFromDir(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.manifest.name).toBe("greeter");
    expect(loaded[0]?.manifest.estimatedCostCredits).toBe(0);
  });

  it("skips directories with an invalid manifest", () => {
    const skillDir = path.join(dir, "broken");
    mkdirSync(skillDir);
    writeFileSync(path.join(skillDir, "skill.json"), JSON.stringify({ name: "broken" }));

    const loaded = loadSkillsFromDir(dir);
    expect(loaded).toHaveLength(0);
  });

  it("skips directories with no manifest at all", () => {
    mkdirSync(path.join(dir, "no-manifest"));
    expect(loadSkillsFromDir(dir)).toHaveLength(0);
  });

  it("returns an empty array for a nonexistent directory", () => {
    expect(loadSkillsFromDir(path.join(dir, "does-not-exist"))).toEqual([]);
  });
});
