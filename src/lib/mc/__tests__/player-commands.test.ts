import { describe, expect, it } from "vitest";
import { Simulator } from "../simulator";
import { COMMANDS } from "../data";
import { entityPos } from "../entities";
import { lintProject } from "../../lint";
import type { Project } from "../datapack";

function pack(extra: Record<string, string> = {}): Project {
  return {
    id: "pack-player-test",
    name: "Player Commands Test",
    versionId: "26.3",
    activePath: "data/test/function/load.mcfunction",
    updatedAt: 0,
    files: {
      "pack.mcmeta": JSON.stringify({
        pack: {
          description: "player command tests",
          min_format: [121, 0],
          max_format: [121, 0],
        },
      }),
      "data/test/function/load.mcfunction": [
        // Declare the trigger objective first: the linter pre-scans these
        // lines with a greedy optional display-name group.
        'scoreboard objectives add reward trigger {"text":"Reward"}',
        "scoreboard objectives add points dummy",
        "scoreboard objectives setdisplay sidebar points",
      ].join("\n"),
      "data/minecraft/tags/function/load.json": JSON.stringify({
        values: ["test:load"],
      }),
      ...extra,
    },
  };
}

function newSim(extra: Record<string, string> = {}): Simulator {
  const sim = new Simulator({ project: pack(extra) });
  sim.reset();
  return sim;
}

describe("/gamemode", () => {
  it("sets the player game mode and reports feedback", () => {
    const sim = newSim();
    const outcome = sim.runCommand("gamemode creative");
    expect(outcome.ok).toBe(true);
    expect(sim.world.playerGameMode()).toBe("creative");
    expect(sim.playerGameMode).toBe("creative");
    expect(
      sim.world.logs.some(
        (entry) => entry.kind === "success" && entry.text.includes("creative"),
      ),
    ).toBe(true);

    sim.runCommand("gamemode adventure @s");
    expect(sim.world.playerGameMode()).toBe("adventure");
  });

  it("rejects an unknown game mode without changing state", () => {
    const sim = newSim();
    const outcome = sim.runCommand("gamemode nope");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("Expected survival, creative, adventure or spectator");
    expect(sim.world.playerGameMode()).toBe("survival");
  });
});

describe("/give and /clear", () => {
  it("merges stacks with the same id and NBT and clears by count or all", () => {
    const sim = newSim();
    expect(sim.runCommand("give @s minecraft:diamond 3").ok).toBe(true);
    expect(sim.runCommand("give Dev diamond 2").ok).toBe(true);

    let inventory = sim.world.playerInventory();
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      id: "minecraft:diamond",
      count: 5,
    });

    // A different NBT payload is a different stack.
    const nbtGive = sim.runCommand(
      'give @s diamond 1 {display:{Name:\'{"text":"Gem"}\'}}',
    );
    expect(nbtGive.ok).toBe(true);
    inventory = sim.world.playerInventory();
    expect(inventory).toHaveLength(2);
    expect(inventory[1].nbt).toBeTruthy();

    const clearSome = sim.runCommand("clear @s minecraft:diamond 2");
    expect(clearSome.ok).toBe(true);
    expect(clearSome.result).toBe(2);
    inventory = sim.world.playerInventory();
    expect(inventory.find((item) => !item.nbt)?.count).toBe(3);

    // No arguments clears the default player's inventory.
    const clearAll = sim.runCommand("clear");
    expect(clearAll.ok).toBe(true);
    expect(clearAll.result).toBe(4);
    expect(sim.world.playerInventory()).toHaveLength(0);
  });

  it("validates a positive give count", () => {
    const sim = newSim();
    const outcome = sim.runCommand("give @s diamond 0");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("positive integer");
    expect(sim.world.playerInventory()).toHaveLength(0);
  });

  it("clears every matching stack when maxCount is omitted", () => {
    const sim = newSim();
    sim.runCommand("give @s stone 4");
    sim.runCommand("give @s stone 6");
    const outcome = sim.runCommand("clear @s stone");
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toBe(10);
    expect(sim.world.playerInventory()).toHaveLength(0);
  });
});

describe("/spectate", () => {
  it("sets the player's spectate target to any entity", () => {
    const sim = newSim();
    sim.runCommand('summon zombie 0 64 0 {Tags:["spectate-me"]}');
    const zombie = sim.world.entities.find((entity) => entity.type === "minecraft:zombie")!;
    const outcome = sim.runCommand("spectate @e[tag=spectate-me,limit=1]");
    expect(outcome.ok).toBe(true);
    expect(sim.world.spectatorTarget()).toBe(zombie.uuid);
  });

  it("accepts the command in the linter", () => {
    const project = pack({
      "data/test/function/spectate.mcfunction": [
        "summon zombie 0 64 0 {Tags:[\"view\"]}",
        "spectate @e[type=zombie,limit=1]",
      ].join("\n"),
    });
    const report = lintProject(project);
    expect(
      report.diagnostics.filter(
        (entry) => entry.path.endsWith("spectate.mcfunction") && entry.severity === "error",
      ),
    ).toEqual([]);
  });
});

describe("/effect", () => {
  it("stores duration in ticks, decrements it on tick and expires effects", () => {
    const sim = newSim();
    const outcome = sim.runCommand("effect give @s speed 1 1 true");
    expect(outcome.ok).toBe(true);
    expect(sim.world.effectsOf()).toMatchObject([
      {
        id: "minecraft:speed",
        amplifier: 1,
        durationTicks: 20,
        hidden: true,
      },
    ]);
    expect(sim.playerEffects).toHaveLength(1);

    for (let i = 0; i < 19; i++) sim.tick();
    expect(sim.world.effectsOf()[0].durationTicks).toBe(1);

    sim.tick();
    expect(sim.world.effectsOf()).toHaveLength(0);
  });

  it("applies and clears effects on non-player entities", () => {
    const sim = newSim();
    sim.runCommand('summon zombie 0 64 0 {Tags:["fx"]}');
    const zombie = sim.world.entities.find(
      (entity) => !entity.isPlayer && entity.type === "minecraft:zombie",
    );
    expect(zombie).toBeTruthy();
    const outcome = sim.runCommand(
      "effect give @e[tag=fx,limit=1] speed 5 1",
    );
    expect(outcome.ok).toBe(true);
    expect(sim.world.effectsOf(zombie!)).toHaveLength(1);
    expect(sim.world.effectsOf(zombie!)[0].id).toBe("minecraft:speed");
    sim.runCommand("effect clear @e[tag=fx,limit=1] speed");
    expect(sim.world.effectsOf(zombie!)).toHaveLength(0);
  });

  it("uses the 30 second default and removes effects on request", () => {
    const sim = newSim();
    expect(sim.runCommand("effect give @s regeneration").ok).toBe(true);
    expect(sim.world.effectsOf()).toMatchObject([
      { id: "minecraft:regeneration", amplifier: 0, durationTicks: 600, hidden: false },
    ]);

    // Effects follow the holder key, so moving the entity does not lose them.
    sim.runCommand("tp @s 8 70 8");
    expect(sim.world.effectsOf()).toHaveLength(1);

    const cleared = sim.runCommand("effect clear @s regeneration");
    expect(cleared.ok).toBe(true);
    expect(cleared.result).toBe(1);
    expect(sim.world.effectsOf()).toHaveLength(0);
  });

  it("validates effect ids and amplifiers", () => {
    const sim = newSim();
    expect(sim.runCommand("effect give @s not_an_effect").ok).toBe(false);
    expect(sim.runCommand("effect give @s speed 5 256").ok).toBe(false);
    expect(sim.world.effectsOf()).toHaveLength(0);
  });
});

describe("/scoreboard players enable and /trigger", () => {
  it("requires a trigger objective and an enabled trigger", () => {
    const sim = newSim();

    const disabled = sim.runCommand("trigger reward add 5");
    expect(disabled.ok).toBe(false);
    expect(disabled.error).toContain("not enabled");

    const notTrigger = sim.runCommand("scoreboard players enable @s points");
    expect(notTrigger.ok).toBe(false);
    expect(notTrigger.error).toContain("not 'trigger'");

    const enabled = sim.runCommand("scoreboard players enable @s reward");
    expect(enabled.ok).toBe(true);
    expect(sim.world.isTriggerEnabled("Dev", "reward")).toBe(true);

    const triggered = sim.runCommand("trigger reward set 5");
    expect(triggered.ok).toBe(true);
    expect(sim.world.getScore("Dev", "reward")).toBe(5);
    expect(sim.world.isTriggerEnabled("Dev", "reward")).toBe(false);

    // Triggers are one-shot until enabled again.
    expect(sim.runCommand("trigger reward set 7").ok).toBe(false);
    expect(sim.world.getScore("Dev", "reward")).toBe(5);
  });

  it("fails when the trigger is already enabled", () => {
    const sim = newSim();
    sim.runCommand("scoreboard objectives add enabled dummy");
    const first = sim.runCommand("scoreboard players enable @s reward");
    expect(first.success).toBe(true);
    const second = sim.runCommand("scoreboard players enable @s reward");
    expect(second.success).toBe(false);
    expect(second.result).toBe(0);

    sim.runCommand(
      "execute store success score #temp enabled run scoreboard players enable @s reward",
    );
    expect(sim.world.getScore("#temp", "enabled")).toBe(0);
  });

  it("adds one by default, supports add/set, and clamps", () => {
    const sim = newSim();
    sim.runCommand("scoreboard players enable @s reward");
    expect(sim.runCommand("trigger reward").ok).toBe(true);
    expect(sim.world.getScore("Dev", "reward")).toBe(0);

    sim.runCommand("scoreboard players enable @s reward");
    sim.runCommand("trigger reward set 4");
    expect(sim.world.getScore("Dev", "reward")).toBe(4);

    sim.runCommand("scoreboard players enable @s reward");
    sim.runCommand("trigger reward");
    expect(sim.world.getScore("Dev", "reward")).toBe(5);

    sim.runCommand("scoreboard players enable @s reward");
    sim.runCommand("trigger reward set -7");
    expect(sim.world.getScore("Dev", "reward")).toBe(-7);

    sim.runCommand("scoreboard players enable @s reward");
    sim.runCommand("trigger reward set 0");
    sim.runCommand("scoreboard players enable @s reward");
    sim.runCommand("trigger reward add 2147483647");
    expect(sim.world.getScore("Dev", "reward")).toBe(2147483647);

    sim.runCommand("scoreboard players enable @s reward");
    const range = sim.runCommand("trigger reward set 9999999999");
    expect(range.ok).toBe(false);
    expect(range.error).toContain("must be between");
  });
});

describe("execute anchored", () => {
  it("uses the eyes and feet as the position anchor", () => {
    const sim = newSim();

    expect(
      sim.runCommand("execute anchored eyes positioned ~ ~ ~ run summon minecraft:marker").ok,
    ).toBe(true);
    let markers = sim.world.entities.filter(
      (entity) => entity.type === "minecraft:marker",
    );
    expect(markers).toHaveLength(1);
    expect(entityPos(markers[0]).y).toBeCloseTo(65.62, 5);

    expect(
      sim.runCommand("execute anchored feet positioned ~ ~ ~ run summon minecraft:marker").ok,
    ).toBe(true);
    markers = sim.world.entities.filter(
      (entity) => entity.type === "minecraft:marker",
    );
    expect(markers).toHaveLength(2);
    expect(entityPos(markers[1]).y).toBeCloseTo(64, 5);
  });

  it("rejects an unknown anchor", () => {
    const sim = newSim();
    const outcome = sim.runCommand("execute anchored sideways run summon minecraft:marker");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("Expected 'eyes' or 'feet'");
  });
});

describe("command metadata and lint", () => {
  it("marks the player commands as supported", () => {
    for (const name of ["gamemode", "give", "clear", "effect", "trigger"]) {
      expect(COMMANDS[name].supported, name).toBe(true);
    }
    expect(COMMANDS.scoreboard.children?.players.children?.enable.supported).toBe(true);
    expect(COMMANDS.execute.children?.anchored.supported).toBe(true);
  });

  it("accepts the new commands in the linter", () => {
    const project = pack({
      "data/test/function/player.mcfunction": [
        "scoreboard objectives add reward trigger",
        "gamemode creative",
        "give @s diamond 2",
        "effect give @s speed 5 1 false",
        "effect clear @s speed",
        "clear @s diamond 1",
        "scoreboard players enable @s reward",
        "execute anchored eyes positioned ~ ~ ~ run trigger reward set 1",
      ].join("\n"),
    });
    const report = lintProject(project);
    const diagnostics = report.diagnostics.filter(
      (diagnostic) =>
        diagnostic.path.endsWith("player.mcfunction") &&
        diagnostic.code !== "unused-function",
    );
    expect(diagnostics).toEqual([]);
    expect(report.errors).toBe(0);
  });
});
