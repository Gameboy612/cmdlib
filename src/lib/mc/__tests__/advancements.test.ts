import { describe, expect, it } from "vitest";
import { createDemoProject } from "./fixtures";
import { Simulator } from "../simulator";
import { lintProject } from "../../lint";

function packWith(advancements: Record<string, string>, reward = "say REWARD\n") {
  const project = createDemoProject("26.3");
  for (const [name, json] of Object.entries(advancements)) {
    project.files[`data/test/advancement/${name}.json`] = json;
  }
  project.files["data/test/function/reward.mcfunction"] = reward;
  return project;
}

describe("advancements", () => {
  it("grants a tick advancement and runs its reward once", () => {
    const project = packWith({
      join: JSON.stringify({
        criteria: { join: { trigger: "minecraft:tick" } },
        rewards: { function: "test:reward" },
      }),
    });
    const sim = new Simulator({ project });
    sim.reset();
    expect(sim.world.getAdvancement("test:join")).toBeDefined();
    sim.tick();
    expect(sim.world.isAdvancementGranted("Dev", "test:join")).toBe(true);
    const rewards = sim.world.logs.filter((entry) => entry.text.includes("REWARD"));
    expect(rewards).toHaveLength(1);
    sim.tick();
    expect(sim.world.logs.filter((entry) => entry.text.includes("REWARD"))).toHaveLength(1);
  });

  it("grants inventory_changed criteria and supports grant/revoke", () => {
    const project = packWith({
      book: JSON.stringify({
        criteria: {
          book: {
            trigger: "minecraft:inventory_changed",
            conditions: { items: [{ items: "minecraft:written_book" }] },
          },
        },
        rewards: { function: "test:reward" },
      }),
    });
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("give @s written_book");
    sim.tick();
    expect(sim.world.isAdvancementGranted("Dev", "test:book")).toBe(true);

    sim.runCommand("advancement revoke @s only test:book");
    expect(sim.world.isAdvancementGranted("Dev", "test:book")).toBe(false);
    sim.runCommand("advancement grant @s only test:book");
    expect(sim.world.isAdvancementGranted("Dev", "test:book")).toBe(true);
  });

  it("lints advancement files and reward functions", () => {
    const project = packWith({
      join: JSON.stringify({
        criteria: { join: { trigger: "minecraft:tick" } },
        rewards: { function: "test:reward" },
      }),
    });
    expect(lintProject(project).errors).toBe(0);

    project.files["data/test/advancement/broken.json"] = "{";
    const broken = lintProject(project);
    expect(broken.diagnostics.some((entry) => entry.code === "invalid-advancement")).toBe(true);
  });
});
