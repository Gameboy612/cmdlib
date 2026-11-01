import { describe, expect, it } from "vitest";
import { parseSnbt, tryParseSnbt } from "../snbt";
import { getPathValues, parseNbtPath, applyPathModify } from "../nbtPath";
import { isCompound, stringifySnbt, Tag } from "../nbt";
import { createDemoProject } from "./fixtures";
import { Simulator } from "../simulator";
import { getVersion } from "../version";
import { parseTextComponent } from "../snbt";
import { plainText } from "../text";

describe("NBT", () => {
  it("parses and prints the demo SNBT", () => {
    const tag = parseSnbt('{id:"wither_hunt",reward:250,active:1b,pos:[1.0d,64.0d,2.0d]}');
    expect(stringifySnbt(tag)).toBe(
      '{id: "wither_hunt", reward: 250, active: 1b, pos: [1.0d, 64.0d, 2.0d]}',
    );
  });

  it("handles quoted keys, escapes and typed arrays", () => {
    const tag = parseSnbt('{"a.b":"line\\nbreak",list:[B;1b,2b], nested:{ok:true}}');
    expect(isCompound(tag)).toBe(true);
    expect(stringifySnbt(tag, { typed: false })).toContain("[B;1, 2]");
  });

  it("reports the index of a syntax error", () => {
    const result = tryParseSnbt('{a:1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.index).toBeGreaterThan(0);
  });
});

describe("NBT paths", () => {
  it("resolves keys, indexes and filters", () => {
    const tag = parseSnbt('{a:{b:[{id:"x",n:1},{id:"y",n:2}]}}');
    const values = getPathValues(tag, parseNbtPath("a.b[1].n"));
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ type: "int", value: 2 });
    const filtered = getPathValues(tag, parseNbtPath('a.b[{id:"y"}]'));
    expect(filtered[0]).toMatchObject({ type: "compound" });
  });

  it("creates intermediate compounds on set", () => {
    const root = Tag.compound();
    applyPathModify(root, parseNbtPath("config.a.b"), "set", Tag.string("ok"));
    expect(stringifySnbt(root, { typed: false })).toBe('{config: {a: {b: "ok"}}}');
  });

  it("appends, inserts and removes list entries", () => {
    const root = Tag.compound({ list: Tag.list([Tag.int(1), Tag.int(3)], "int") });
    applyPathModify(root, parseNbtPath("list"), "insert", Tag.int(2), 1);
    applyPathModify(root, parseNbtPath("list"), "append", Tag.int(4));
    applyPathModify(root, parseNbtPath("list[0]"), "remove", null);
    expect((getPathValues(root, parseNbtPath("list"))[0] as { value: Array<{ value: number }> }).value.map((t) => t.value)).toEqual([2, 3, 4]);
  });
});

describe("text components", () => {
  it("renders styles, score and extra", () => {
    const component = parseTextComponent(
      '{"text":"Hi","color":"gold","bold":true,"extra":[{"text":" there","color":"aqua"}]}',
    );
    const runs = plainText(component);
    expect(runs).toBe("Hi there");
  });
});

describe("simulator", () => {
  it("loads the starter pack", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    expect(sim.world.getObjective("points")).toBeTruthy();
    expect(sim.world.displaySlots.get("sidebar")).toBe("points");
    expect(sim.world.entities.some((e) => e.type === "minecraft:zombie")).toBe(true);
    expect(sim.world.storage("cmdlib:board")).toBeTruthy();
    const quest = getPathValues(
      sim.world.storage("cmdlib:board")!,
      parseNbtPath("quest"),
    )[0];
    expect(stringifySnbt(quest, { typed: false })).toBe('{id: "wither_hunt", reward: 250, active: 1}');
  });

  it("runs the full demo including macros, storage and execute store", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand("function cmdlib:demo");
    expect(outcome.ok).toBe(true);
    expect(sim.world.getScore("Dev", "points")).toBe(300);
    expect(sim.world.getScore("Dev", "streak")).toBe(1);
    const stats = getPathValues(
      sim.world.storage("cmdlib:stats")!,
      parseNbtPath("points"),
    )[0];
    expect(stats).toMatchObject({ type: "int", value: 300 });
    const target = sim.world.entities.find((e) => e.type === "minecraft:zombie")!;
    const pos = getPathValues(target.nbt, parseNbtPath("Pos"));
    expect((pos[0] as { value: Array<{ value: number }> }).value.map((t) => t.value)).toEqual([0, 64, 0]);
    expect(plainText(sim.world.titles.actionbar!)).toBe("Streak x1");
    expect(sim.world.logs.some((l) => l.kind === "data" && l.text.includes("stats"))).toBe(true);
  });

  it("supports scoreboard operations and titles", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("scoreboard players set @s points 10");
    sim.runCommand("scoreboard players add @s points 5");
    sim.runCommand("scoreboard players set @s streak 2");
    sim.runCommand("scoreboard players operation @s points *= @s streak");
    expect(sim.world.getScore("Dev", "points")).toBe(30);
    sim.runCommand('title @s title {"text":"Hello","color":"gold"}');
    expect(sim.world.titles.title).toBeTruthy();
    expect(plainText(sim.world.titles.title!)).toBe("Hello");
  });

  it("copies a whole entity payload when the source path is omitted", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand(
      "data modify storage su:temp Entity set from entity @s",
    );
    expect(outcome.ok).toBe(true);
    const entity = sim.world.storage("su:temp")?.value.Entity;
    expect(isCompound(entity)).toBe(true);
    if (!isCompound(entity)) return;
    expect(entity.value.Pos).toBeTruthy();
    expect(entity.value.Health).toBeTruthy();
  });

  it("edits storage with data modify and reports with data get", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("data modify storage test:store board set value {a:1}");
    sim.runCommand("data modify storage test:store board.list set value []");
    sim.runCommand("data modify storage test:store board.list append value {n:1}");
    sim.runCommand("data modify storage test:store board.list append value {n:2}");
    sim.runCommand("data modify storage test:store board.list[0].n set value 9");
    const root = sim.world.storage("test:store")!;
    expect(
      getPathValues(root, parseNbtPath("board.list[0].n"))[0].value,
    ).toBe(9);
    sim.runCommand("data get storage test:store board.list");
    expect(sim.world.logs.some((l) => l.kind === "data" && l.text.includes("board.list"))).toBe(true);
  });

  it("models function macros through with storage", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand('data modify storage cmdlib:board quest set value {reward:42}');
    sim.runScript("function cmdlib:reward with storage cmdlib:board quest", { quiet: false });
    expect(sim.world.getScore("Dev", "points")).toBe(42);
    const last = sim.world.storage("cmdlib:board")!.value.last_reward;
    expect(stringifySnbt(last, { typed: false })).toBe('{amount: 42, holder: "@s"}');
  });
});

describe("version profiles", () => {
  it("knows 26.3 pack format 121.0", () => {
    const version = getVersion("26.3");
    expect(version.packFormat).toEqual([121, 0]);
    expect(version.functionFolder).toBe("function");
    expect(version.textComponents).toBe("snbt");
  });
  it("keeps legacy folder names for 1.20", () => {
    const version = getVersion("1.20.4");
    expect(version.functionFolder).toBe("functions");
    expect(version.macros).toBe(true);
    expect(getVersion("1.20").macros).toBe(false);
  });
});

describe("scoreboard integer bounds", () => {
  it("clamps arithmetic to the Java 32-bit signed range", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("scoreboard players set @s points 2147483647");
    sim.runCommand("scoreboard players add @s points 1");
    expect(sim.world.getScore("Dev", "points")).toBe(2147483647);

    sim.runCommand("scoreboard players set @s streak 2");
    sim.runCommand("scoreboard players operation @s points *= @s streak");
    expect(sim.world.getScore("Dev", "points")).toBe(2147483647);

    sim.runCommand("scoreboard players set @s points -2147483648");
    sim.runCommand("scoreboard players remove @s points 1");
    expect(sim.world.getScore("Dev", "points")).toBe(-2147483648);

    sim.world.setScore("Dev", "points", Number.POSITIVE_INFINITY);
    expect(sim.world.getScore("Dev", "points")).toBe(2147483647);
    sim.world.setScore("Dev", "points", -1e20);
    expect(sim.world.getScore("Dev", "points")).toBe(-2147483648);
  });

  it("rejects score arguments outside the signed 32-bit range", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand("scoreboard players set @s points 2147483648");
    expect(outcome.ok).toBe(false);
    expect(sim.world.getScore("Dev", "points") ?? 0).toBe(0);
  });
});

describe("unsupported command handling", () => {
  it("continues a function after an unsupported command", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/continue.mcfunction"] = [
      "playsound minecraft:block.note_block.bell master @s",
      "scoreboard players add @s points 1",
    ].join("\n");
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand("function cmdlib:continue");
    expect(outcome.ok).toBe(true);
    expect(sim.world.getScore("Dev", "points")).toBe(1);
    expect(
      sim.world.logs.some(
        (entry) =>
          entry.kind === "warning" && entry.text.includes("Warning:") && entry.text.includes("/playsound"),
      ),
    ).toBe(true);
  });
});

describe("unset scores in execute if", () => {
  it("treats two unset scores as equal", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/unset.mcfunction"] = [
      "scoreboard objectives add Score dummy",
      "execute if score player Score = player Score run say PASS",
    ].join("\n");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("function cmdlib:unset");
    expect(sim.world.logs.some((entry) => entry.text.includes("PASS"))).toBe(true);
  });
});
