import { describe, expect, it } from "vitest";
import { PATHS } from "../src/config.js";
import { guardWrite, isProtectedPath, protectedPaths } from "../src/self-mod/protected-files.js";

describe("protected-files guard", () => {
  it("flags the constitution path as protected", () => {
    expect(isProtectedPath(PATHS.constitution)).toBe(true);
  });

  it("flags the repo constitution source as protected", () => {
    expect(isProtectedPath("scripts/conways-rules.txt")).toBe(true);
  });

  it("does not flag unrelated files", () => {
    expect(isProtectedPath("workspace/notes.md")).toBe(false);
    expect(isProtectedPath(PATHS.soul)).toBe(false);
  });

  it("guardWrite refuses protected paths with a reason", () => {
    const result = guardWrite(PATHS.constitution);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/protected/i);
  });

  it("guardWrite allows non-protected paths", () => {
    const result = guardWrite("workspace/notes.md");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("exposes the protected path list", () => {
    expect(protectedPaths().length).toBeGreaterThan(0);
  });
});
