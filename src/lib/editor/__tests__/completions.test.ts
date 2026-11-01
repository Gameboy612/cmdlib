import { describe, expect, it } from "vitest";
import { createDemoProject } from "../../mc/__tests__/fixtures";
import { getVersion } from "../../mc/version";
import { World } from "../../mc/world";
import { buildCompletionIndex, lineCompletions } from "../completions";

const project = createDemoProject("26.3");
const index = buildCompletionIndex(project, getVersion("26.3"));
const labels = (text: string) => lineCompletions(text, index)?.options.map((o) => o.label) ?? [];

describe("completions", () => {
  it("offers commands at line start", () => {
    expect(labels("score")).toContain("scoreboard");
    expect(labels("function ")).toContain("cmdlib:demo");
  });
  it("walks scoreboard literals", () => {
    expect(labels("scoreboard ")).toContain("objectives");
    expect(labels("scoreboard objectives ")).toContain("add");
    expect(labels("scoreboard players set @s ")).toContain("points");
  });
  it("knows objectives and criteria", () => {
    expect(labels("scoreboard objectives add foo ")).toContain("dummy");
    expect(labels("scoreboard objectives setdisplay sidebar ")).toContain("points");
  });
  it("offers selectors and title actions", () => {
    expect(labels("kill @")).toContain("@e");
    expect(labels("title @s ")).toContain("title");
    expect(labels("title @s title ")).toContain("text component");
  });
  it("understands data paths and modes", () => {
    expect(labels("data modify storage ")).toContain("cmdlib:board");
    expect(labels("data modify storage cmdlib:board quest ")).toContain("set");
    expect(labels("data modify storage cmdlib:board quest set ")).toContain("value");
    expect(labels("data modify entity @s Pos ")).toContain("set");
  });
  it("understands execute chains", () => {
    expect(labels("execute ")).toContain("as");
    expect(labels("execute if ")).toContain("score");
    expect(labels("execute if score @s ")).toContain("points");
    expect(labels("execute as @e ")).toContain("run");
  });
  it("suggests summon types", () => {
    expect(labels("summon ")).toContain("zombie");
    expect(labels("summon zombie ")).toContain("position");
  });
  it("does not complete inside comments", () => {
    expect(lineCompletions("# score", index)).toBeNull();
  });
});

describe("trigger completion", () => {
  it("only suggests triggers enabled for the player", () => {
    const version = getVersion("26.3");
    const world = new World({ version, seedPlayer: true, playerName: "Dev" });
    world.addObjective("reward", "trigger");
    world.addObjective("points", "dummy");
    world.setTriggerEnabled(world.player()!, "reward", true);
    const live = buildCompletionIndex(project, version, world);
    const triggerLabels = (text: string) =>
      lineCompletions(text, live)?.options.map((option) => option.label) ?? [];

    expect(triggerLabels("trigger ")).toContain("reward");
    expect(triggerLabels("trigger ")).not.toContain("points");
    expect(triggerLabels("trigger reward ")).toContain("add");
    expect(triggerLabels("trigger reward ")).toContain("set");

    world.setTriggerEnabled(world.player()!, "reward", false);
    const disabled = buildCompletionIndex(project, version, world);
    const disabledLabels = lineCompletions("trigger ", disabled)?.options.map((option) => option.label) ?? [];
    expect(disabledLabels).not.toContain("reward");
  });
});
