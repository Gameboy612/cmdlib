import { describe, expect, it } from "vitest";
import { createDemoProject } from "./fixtures";
import { lintProject, toLspDiagnostics } from "../../lint";
import { getVersion } from "../version";
import { createProject } from "../datapack";

describe("linter", () => {
  it("accepts the starter pack", () => {
    const project = createDemoProject("26.3");
    const report = lintProject(project);
    expect(report.errors).toBe(0);
    expect(report.filesLinted).toBeGreaterThanOrEqual(4);
  });

  it("keeps the new load/tick starter quiet", () => {
    const report = lintProject(createProject("26.3"));
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
  });

  it("catches unknown objectives, functions and macro arguments", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/broken.mcfunction"] = [
      "scoreboard players add @s missing 1",
      "function cmdlib:does_not_exist",
      "function cmdlib:reward",
      "title @s title",
    ].join("\n");
    const report = lintProject(project);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("unknown-objective");
    expect(codes).toContain("unknown-function");
    expect(codes).toContain("macro-required");
    expect(codes).toContain("title-component");
    expect(report.errors).toBeGreaterThanOrEqual(4);
  });

  it("validates pack formats and legacy folders", () => {
    const project = createDemoProject("1.20.4");
    // createProject builds the correct legacy layout; now break the metadata.
    project.files["pack.mcmeta"] = JSON.stringify({ pack: { pack_format: 999, description: "x" } });
    const report = lintProject(project);
    expect(report.diagnostics.some((d) => d.code === "pack-format-mismatch")).toBe(true);
  });

  it("reports version-gated commands", () => {
    const project = createDemoProject("1.20.4");
    project.files["data/cmdlib/functions/version.mcfunction"] = [
      "compute default integer 1",
      "execute if items block ~ ~ ~ slot.weapon mainhand *",
    ].join("\n");
    const report = lintProject(project);
    const messages = report.diagnostics.map((d) => d.message).join("\n");
    expect(messages).toContain("compute");
  });

  it("emits LSP-compatible diagnostics", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/broken.mcfunction"] = "scoreboard players add @s nope 1";
    const report = lintProject(project);
    const lsp = toLspDiagnostics(report.diagnostics) as Array<{ range: unknown; severity: number }>;
    expect(lsp.length).toBeGreaterThan(0);
    expect(lsp[0].range).toBeTruthy();
  });

  it("keeps unsupported commands as warnings, not errors", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/other.mcfunction"] = "xp add @s 1";
    const report = lintProject(project);
    const diag = report.diagnostics.find((d) => d.code === "unsupported-command");
    expect(diag?.severity).toBe("warning");
  });

  it("matches 26.3 pack format", () => {
    expect(getVersion("26.3").packFormat).toEqual([121, 0]);
  });

  it("lints non-function tags without function checks", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/tags/item/ores.json"] = JSON.stringify({
      values: ["minecraft:iron_ore", "#minecraft:coal_ores"],
    });
    project.files["data/cmdlib/tags/block/stone.json"] = JSON.stringify({
      values: ["minecraft:stone"],
    });
    project.files["data/cmdlib/tags/entity_type/hostiles.json"] = JSON.stringify({
      values: ["minecraft:zombie"],
    });
    const report = lintProject(project);
    expect(report.diagnostics.some((d) => d.code.startsWith("unknown-function"))).toBe(false);
    expect(report.errors).toBe(0);
  });

  it("reports malformed tag files with a tag-specific code", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/tags/item/broken.json"] = "{ values: [";
    project.files["data/cmdlib/tags/block/empty.json"] = JSON.stringify({ values: 1 });
    const report = lintProject(project);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("invalid-tag-json");
    expect(codes).toContain("missing-tag-values");
  });
});

describe("cross-pack objective resolution", () => {
  it("seeds objectives declared by sibling packs", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/function/uses.mcfunction"] =
      "scoreboard players set @s shared 1\n";
    const report = lintProject(project, {
      objectiveSources: [
        {
          "data/other/function/load.mcfunction":
            "scoreboard objectives add shared dummy\n",
        },
      ],
    });
    expect(
      report.diagnostics.filter((entry) => entry.code === "unknown-objective"),
    ).toHaveLength(0);
  });
});

describe("objective declaration pre-scan", () => {
  it("does not swallow the next declaration line", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/function/objectives.mcfunction"] = [
      "scoreboard objectives add first dummy",
      "scoreboard objectives add second trigger",
      "scoreboard players set @s second 1",
    ].join("\n");
    const report = lintProject(project);
    expect(
      report.diagnostics.filter((entry) => entry.code === "unknown-objective"),
    ).toHaveLength(0);
  });
});

describe("large project lint budget", () => {
  it("returns a truncation warning instead of crashing", () => {
    const project = createProject("26.3");
    for (let i = 0; i < 2_100; i++) {
      project.files[`data/cmdlib/function/bulk_${i}.mcfunction`] = "say ok\n";
    }
    const report = lintProject(project);
    expect(report.diagnostics.some((entry) => entry.code === "lint-truncated")).toBe(true);
    expect(report.filesLinted).toBeLessThanOrEqual(2_000);
  }, 15_000);
});
