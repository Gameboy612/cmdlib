import { describe, expect, it } from "vitest";
import { Simulator } from "../simulator";
import { COMMANDS } from "../data";
import { lintProject } from "../../lint";
import type { Project } from "../datapack";
import {
  parseScheduleTime,
  TICKS_PER_DAY,
  TICKS_PER_SECOND,
} from "../commands/schedule";

const BASE_FILES: Record<string, string> = {
  "data/test/function/load.mcfunction": [
    "scoreboard objectives add ticks dummy",
    "scoreboard players set @s ticks 0",
  ].join("\n"),
  "data/minecraft/tags/function/load.json": JSON.stringify({ values: ["test:load"] }),
  "data/test/function/mark.mcfunction": "scoreboard players add @s ticks 1\n",
  "data/test/function/tick_a.mcfunction": "scoreboard players add @s ticks 1\n",
  "data/test/function/tick_b.mcfunction": "scoreboard players add @s ticks 10\n",
};

function pack(extra: Record<string, string> = {}): Project {
  return {
    id: "pack-timeline-test",
    name: "Timeline Test",
    versionId: "26.3",
    activePath: "data/test/function/load.mcfunction",
    updatedAt: 0,
    files: { ...BASE_FILES, ...extra },
  };
}

function tickTag(values: string[]): Record<string, string> {
  return {
    "data/minecraft/tags/function/tick.json": JSON.stringify({ values }),
  };
}

describe("schedule time parsing", () => {
  it("converts ticks, seconds and days", () => {
    expect(TICKS_PER_SECOND).toBe(20);
    expect(TICKS_PER_DAY).toBe(24000);
    expect(parseScheduleTime("1t")).toBe(1);
    expect(parseScheduleTime("0t")).toBe(0);
    expect(parseScheduleTime("20t")).toBe(20);
    expect(parseScheduleTime("03s")).toBe(60);
    expect(parseScheduleTime("2s")).toBe(40);
    expect(parseScheduleTime("1d")).toBe(24000);
    expect(parseScheduleTime("2d")).toBe(48000);
  });

  it("rejects non-integers, missing units and unknown units", () => {
    for (const raw of ["", "1", "1.5s", "1m", "-1t", "+1t", "1S", "1T", "t", "1 t", "1s "]) {
      expect(parseScheduleTime(raw), raw).toBeNull();
    }
  });
});

describe("schedule command", () => {
  it("replaces a function's queue by default and appends on request", () => {
    const sim = new Simulator({ project: pack() });
    sim.reset();

    let outcome = sim.runCommand("schedule function test:mark 5t");
    expect(outcome.ok).toBe(true);
    expect(sim.scheduled).toHaveLength(1);
    expect(sim.scheduled[0]).toMatchObject({
      functionId: "test:mark",
      scheduledAtTick: 0,
      dueTick: 5,
      sequence: 1,
    });

    // The default mode is replace, so the old due tick disappears.
    outcome = sim.runCommand("schedule function test:mark 3t");
    expect(outcome.ok).toBe(true);
    expect(sim.scheduled).toHaveLength(1);
    expect(sim.scheduled[0].dueTick).toBe(3);
    expect(sim.scheduled[0].sequence).toBe(2);

    // Append keeps both calls, ordered by due tick and insertion sequence.
    outcome = sim.runCommand("schedule function test:mark 7t append");
    expect(outcome.ok).toBe(true);
    expect(sim.scheduled).toHaveLength(2);
    expect(sim.scheduled.map((entry) => entry.dueTick)).toEqual([3, 7]);
    expect(sim.scheduled.map((entry) => entry.sequence)).toEqual([2, 3]);

    // Appending a second call at the same due tick keeps insertion order.
    sim.runCommand("schedule function test:mark 7t append");
    const dueSeven = sim.scheduled.filter((entry) => entry.dueTick === 7);
    expect(dueSeven).toHaveLength(2);
    expect(dueSeven[0].sequence).toBeLessThan(dueSeven[1].sequence);

    const clear = sim.runCommand("schedule clear test:mark");
    expect(clear.ok).toBe(true);
    expect(sim.scheduled).toHaveLength(0);
    expect(sim.world.logs.some((entry) => entry.text.includes("Cleared 3 scheduled"))).toBe(true);
  });

  it("reports console feedback and validation errors", () => {
    const sim = new Simulator({ project: pack() });
    sim.reset();

    const scheduled = sim.runCommand("schedule function test:mark 2s");
    expect(scheduled.ok).toBe(true);
    expect(sim.world.logs.some((entry) => entry.text.includes("Scheduled function test:mark in 40 ticks"))).toBe(true);

    const unknown = sim.runCommand("schedule function test:missing 1t");
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("Unknown function 'test:missing'");

    const badTime = sim.runCommand("schedule function test:mark 1.5s");
    expect(badTime.ok).toBe(false);
    expect(badTime.error).toContain("Invalid time '1.5s'");

    const badMode = sim.runCommand("schedule function test:mark 1t sometimes");
    expect(badMode.ok).toBe(false);
    expect(badMode.error).toContain("Expected 'append' or 'replace'");

    const badAction = sim.runCommand("schedule tick test:mark 1t");
    expect(badAction.ok).toBe(false);
    expect(badAction.error).toContain("Expected 'function' or 'clear'");

    // Failed commands never mutate the queue; only the first command queued.
    expect(sim.scheduled).toHaveLength(1);
  });

  it("clears a function's whole queue and leaves other functions alone", () => {
    const sim = new Simulator({
      project: pack({
        "data/test/function/other.mcfunction": "scoreboard players add @s ticks 2\n",
      }),
    });
    sim.reset();
    sim.runCommand("schedule function test:mark 1t append");
    sim.runCommand("schedule function test:mark 2t append");
    sim.runCommand("schedule function test:other 3t");
    expect(sim.scheduled).toHaveLength(3);

    sim.runCommand("schedule clear test:mark");
    expect(sim.scheduled.map((entry) => entry.functionId)).toEqual(["test:other"]);
  });

  it("exposes the supported linter metadata", () => {
    expect(COMMANDS.schedule.supported).toBe(true);
    expect(COMMANDS.schedule.usage).toContain("schedule function");
    expect(COMMANDS.schedule.usage).toContain("schedule clear");
  });

  it("lints /schedule as a simulated command", () => {
    const report = lintProject(
      pack({
        "data/test/function/scheduled.mcfunction": [
          "schedule function test:mark 20t",
          "schedule function test:mark 10t append",
          "schedule clear test:mark",
        ].join("\n"),
      }),
    );
    const scheduleDiagnostics = report.diagnostics.filter(
      (diagnostic) =>
        diagnostic.path.endsWith("scheduled.mcfunction") &&
        diagnostic.code !== "unused-function",
    );
    expect(scheduleDiagnostics).toEqual([]);
  });
});

describe("Simulator.tick", () => {
  it("increments the tick and runs every value of the minecraft:tick tag", () => {
    const sim = new Simulator({
      project: pack(tickTag(["test:tick_a", "test:tick_b"])),
    });
    sim.reset();
    expect(sim.world.tick).toBe(0);

    const outcome = sim.tick();
    expect(outcome).toMatchObject({
      tick: 1,
      tickTagRan: true,
      scheduledRan: 0,
      ok: true,
    });
    expect(sim.world.tick).toBe(1);
    expect(sim.world.getScore("Dev", "ticks")).toBe(11);

    const second = sim.tick();
    expect(second.tick).toBe(2);
    expect(sim.world.getScore("Dev", "ticks")).toBe(22);
  });

  it("returns a quiet outcome when no tick tag exists", () => {
    const sim = new Simulator({ project: pack() });
    sim.reset();
    const outcome = sim.tick();
    expect(outcome.tickTagRan).toBe(false);
    expect(outcome.scheduledRan).toBe(0);
    expect(outcome.ok).toBe(true);
    expect(sim.world.tick).toBe(1);
  });

  it("notifies subscribers on every tick", () => {
    const sim = new Simulator({ project: pack() });
    sim.reset();
    const before = sim.getSnapshot();
    let calls = 0;
    const unsubscribe = sim.subscribe(() => {
      calls++;
    });
    sim.tick();
    expect(calls).toBe(1);
    expect(sim.getSnapshot()).toBeGreaterThan(before);
    unsubscribe();
    sim.tick();
    expect(calls).toBe(1);
  });

  it("survives a function tag cycle and reports the error", () => {
    const sim = new Simulator({
      project: pack({
        ...tickTag(["test:tick_loop"]),
        "data/test/function/tick_loop.mcfunction": "function #test:loop\n",
        "data/test/tags/function/loop.json": JSON.stringify({ values: ["#test:loop"] }),
      }),
    });
    sim.reset();

    const outcome = sim.tick();
    expect(outcome.tickTagRan).toBe(true);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]).toContain("cycle");
    expect(sim.world.tick).toBe(1);
    expect(sim.world.logs.some((entry) => entry.kind === "error" && entry.text.includes("cycle"))).toBe(true);
  });

  it("runs scheduled functions once they become due", () => {
    const sim = new Simulator({ project: pack() });
    sim.reset();
    sim.runCommand("schedule function test:mark 2t");

    const first = sim.tick();
    expect(first.scheduledRan).toBe(0);
    expect(sim.world.getScore("Dev", "ticks")).toBe(0);
    expect(sim.scheduled[0].dueTick).toBe(2);

    const second = sim.tick();
    expect(second.scheduledRan).toBe(1);
    expect(sim.world.getScore("Dev", "ticks")).toBe(1);
    expect(sim.scheduled).toHaveLength(0);

    const third = sim.tick();
    expect(third.scheduledRan).toBe(0);
    expect(sim.world.getScore("Dev", "ticks")).toBe(1);
  });

  it("runs due schedules queued by the tick tag without corrupting iteration", () => {
    const sim = new Simulator({
      project: pack({
        ...tickTag(["test:tick_schedule"]),
        "data/test/function/tick_schedule.mcfunction":
          "schedule function test:mark 1t append\n",
      }),
    });
    sim.reset();

    // Tick 1 queues mark for tick 2.
    const first = sim.tick();
    expect(first.scheduledRan).toBe(0);
    expect(sim.scheduled).toHaveLength(1);
    expect(sim.scheduled[0].dueTick).toBe(2);

    // Tick 2 queues another copy, then runs the one that was due.
    const second = sim.tick();
    expect(second.scheduledRan).toBe(1);
    expect(sim.world.getScore("Dev", "ticks")).toBe(1);
    expect(sim.scheduled).toHaveLength(1);
    expect(sim.scheduled[0].dueTick).toBe(3);
  });

  it("clears schedules when the world resets", () => {
    const sim = new Simulator({ project: pack() });
    sim.reset();
    sim.runCommand("schedule function test:mark 10t append");
    sim.runCommand("schedule function test:mark 20t append");
    expect(sim.scheduled).toHaveLength(2);

    sim.reset();
    expect(sim.scheduled).toHaveLength(0);

    sim.tick();
    expect(sim.world.getScore("Dev", "ticks")).toBe(0);
  });
});
