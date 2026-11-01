import { describe, expect, it } from "vitest";
import { collectStorageIds, createProject } from "../datapack";
import { createDemoProject } from "./fixtures";
import { getVersion, migrateFiles } from "../version";

describe("version migration", () => {
  it("renames folders and rewrites pack.mcmeta without a leading slash", () => {
    const project = createDemoProject("26.3");
    const migrated = migrateFiles(
      project.files,
      getVersion("26.3"),
      getVersion("1.20.4"),
      project.name,
    );
    const paths = Object.keys(migrated);
    expect(paths.some((p) => p.startsWith("/"))).toBe(false);
    expect(paths).toContain("data/cmdlib/functions/load.mcfunction");
    expect(paths).toContain("data/minecraft/tags/functions/load.json");
    expect(JSON.parse(migrated["pack.mcmeta"]).pack.pack_format).toBe(26);
  });

  it("round-trips back to 26.3", () => {
    const project = createDemoProject("26.3");
    const down = migrateFiles(
      project.files,
      getVersion("26.3"),
      getVersion("1.20.4"),
      project.name,
    );
    const up = migrateFiles(down, getVersion("1.20.4"), getVersion("26.3"), project.name);
    expect(Object.keys(up)).toContain("data/cmdlib/function/demo.mcfunction");
    expect(Object.keys(up)).toContain("data/minecraft/tags/function/load.json");
    expect(JSON.parse(up["pack.mcmeta"]).pack.min_format).toEqual([121, 0]);
  });

  it("ships a new project with only load and tick functions", () => {
    const project = createProject("26.3");
    const functions = Object.keys(project.files).filter((path) => path.endsWith(".mcfunction"));
    expect(functions.sort()).toEqual([
      "data/cmdlib/function/load.mcfunction",
      "data/cmdlib/function/tick.mcfunction",
    ]);
    expect(project.files["data/cmdlib/function/load.mcfunction"]).not.toContain("scoreboard");
    expect(project.files["data/cmdlib/function/tick.mcfunction"]).not.toContain("scoreboard");
  });

  it("does not treat comment prose as a storage id", () => {
    expect(collectStorageIds(createDemoProject("26.3").files)).not.toContain("minecraft:compound.");
  });
});
