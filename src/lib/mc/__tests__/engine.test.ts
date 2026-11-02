import { describe, expect, it } from "vitest";
import { parseSnbt, tryParseSnbt } from "../snbt";
import { getPathValues, parseNbtPath, applyPathModify } from "../nbtPath";
import { isCompound, stringifySnbt, Tag } from "../nbt";
import { createDemoProject } from "./fixtures";
import { Simulator } from "../simulator";
import { entityPos } from "../entities";
import { getVersion } from "../version";
import { parseTextComponent } from "../snbt";
import { plainText, renderTextComponent } from "../text";

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
  it("does not pass if either score is unset", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/unset.mcfunction"] = [
      "scoreboard objectives add Score dummy",
      "execute if score player Score = player Score run say IF-PASS",
      "execute unless score player Score = player Score run say UNLESS-PASS",
    ].join("\n");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("function cmdlib:unset");
    const logs = sim.world.logs.map((entry) => entry.text).join("\n");
    expect(logs).not.toContain("IF-PASS");
    expect(logs).toContain("UNLESS-PASS");
  });

  it("treats an existing zero score as set", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/zero.mcfunction"] = [
      "scoreboard objectives add Zero dummy",
      "scoreboard players set @s Zero 0",
      "execute if score @s Zero = @s Zero run say ZERO-PASS",
    ].join("\n");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("function cmdlib:zero");
    expect(sim.world.logs.some((entry) => entry.text.includes("ZERO-PASS"))).toBe(true);
  });
});

describe("terminal execute if", () => {
  it("returns failure without a run clause when the score is unset", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("scoreboard objectives add tpa dummy");
    const outcome = sim.runCommand("execute if score @s tpa = @s tpa");
    expect(outcome.ok).toBe(true);
    expect(outcome.success).toBe(false);
  });

  it("passes without a run clause once the score exists", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("scoreboard objectives add tpa dummy");
    sim.runCommand("scoreboard players set @s tpa 0");
    const outcome = sim.runCommand("execute if score @s tpa = @s tpa");
    expect(outcome.ok).toBe(true);
    expect(outcome.success).toBe(true);
  });

  it("fails without an error when the condition is false", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("scoreboard objectives add tpa dummy");
    sim.runCommand("scoreboard objectives add missing dummy");
    sim.runCommand("scoreboard players set @s tpa 1");
    const outcome = sim.runCommand("execute if score @s tpa = @s missing");
    expect(outcome.ok).toBe(true);
    expect(outcome.success).toBe(false);
  });
});

describe("summoned entity UUIDs", () => {
  it("gives every summoned entity a random UUID int array", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("summon area_effect_cloud 0 64 0");
    sim.runCommand("summon area_effect_cloud 1 64 0");
    const clouds = sim.world.entities.filter((entity) => entity.type === "minecraft:area_effect_cloud");
    expect(clouds).toHaveLength(2);
    const uuids = clouds.map((entity) => entity.nbt.value.UUID);
    expect(uuids[0]?.type).toBe("intArray");
    expect(uuids[1]?.type).toBe("intArray");
    if (uuids[0]?.type !== "intArray" || uuids[1]?.type !== "intArray") return;
    expect(uuids[0].value).toHaveLength(4);
    expect(uuids[0].value).not.toEqual(uuids[1].value);
  });

  it("reads and writes UUID[0] through NBT paths and /data", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("summon area_effect_cloud 0 64 0");
    const cloud = sim.world.entities.find((entity) => entity.type === "minecraft:area_effect_cloud")!;
    const values = getPathValues(cloud.nbt, parseNbtPath("UUID[0]"));
    expect(values).toHaveLength(1);
    fireEvent: {
      const outcome = sim.runCommand(
        "data modify entity @e[type=area_effect_cloud,limit=1] UUID[0] set value 42",
      );
      expect(outcome.ok).toBe(true);
    }
    expect(getPathValues(cloud.nbt, parseNbtPath("UUID[0]"))[0].value).toBe(42);
    const get = sim.runCommand(
      "data get entity @e[type=area_effect_cloud,limit=1] UUID[0]",
    );
    expect(get.ok).toBe(true);
  });
});

describe("data get numeric result", () => {
  it("feeds UUID[0] into execute store result", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("scoreboard objectives add LCG.consts dummy");
    sim.runCommand('summon area_effect_cloud 0 64 0 {Tags:["LCG.seed"]}');
    const cloud = sim.world.entities.find(
      (entity) =>
        entity.type === "minecraft:area_effect_cloud" &&
        (entity.nbt.value.Tags as { value?: Array<{ value: string }> } | undefined)?.value?.some(
          (tag) => tag.value === "LCG.seed",
        ),
    )!;
    const uuid = cloud.nbt.value.UUID;
    expect(uuid?.type).toBe("intArray");
    if (uuid?.type !== "intArray") return;
    const expected = uuid.value[0];
    const outcome = sim.runCommand(
      "execute store result score #seed LCG.consts run data get entity @e[type=area_effect_cloud,tag=LCG.seed,distance=0,limit=1] UUID[0]",
    );
    expect(outcome.ok).toBe(true);
    expect(sim.world.getScore("#seed", "LCG.consts")).toBe(expected);
  });
});

describe("datapack compatibility features", () => {
  it("accepts forceload and targets entities by UUID", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    expect(sim.runCommand("forceload add 29999999 91665").ok).toBe(true);
    const summon = sim.runCommand(
      "summon item_display 0 64 0 {UUID:[I;596917,0,0,65535]}",
    );
    expect(summon.ok).toBe(true);
    const outcome = sim.runCommand(
      "execute as 91bb5-0-0-0-ffff run data modify storage test:uuid value set from entity @s UUID[0]",
    );
    expect(outcome.ok).toBe(true);
    const value = sim.world.storage("test:uuid")?.value.value;
    expect(value?.type).toBe("int");
    if (value?.type === "int") expect(value.value).toBe(596917);
  });

  it("supports negative list indexes, compound filters and string slices", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand(
      'data merge storage test:data {list:[{n:1},{n:2}],str:"abc",obj:{x:"fail"}}',
    );
    sim.runCommand("data modify storage test:data list[-1].n set value 9");
    expect(
      sim.runCommand("data get storage test:data list[-1].n").ok,
    ).toBe(true);
    expect(
      sim.runCommand("data remove storage test:data list[-1]").ok,
    ).toBe(true);
    sim.runCommand("data modify storage test:data str set string storage test:data str 0 -1");
    expect(sim.runCommand("data get storage test:data str").ok).toBe(true);
    sim.runCommand('execute if data storage test:data obj{x:"fail"} run say MATCH');
    expect(
      sim.world.logs.some((entry) => entry.text.includes("MATCH")),
    ).toBe(true);
  });

  it("supports execute if function and tp facing/local coordinates", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/cond.mcfunction"] = "return 1\n";
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("execute if function cmdlib:cond run say COND-PASS");
    expect(
      sim.world.logs.some((entry) => entry.text.includes("COND-PASS")),
    ).toBe(true);

    sim.runCommand("tp @s 0 64 0 facing 0 64 1");
    const player = sim.world.player()!;
    const rotation = player.nbt.value.Rotation;
    expect(rotation?.type).toBe("list");
    sim.runCommand("tp @s ^ ^ ^2");
    expect(entityPos(sim.world.player()!).z).toBeGreaterThan(1);
  });
});

describe("scoreboard objective removal", () => {
  it("warns instead of erroring when the objective is missing", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand("scoreboard objectives remove missing");
    expect(outcome.ok).toBe(true);
    expect(outcome.success).toBe(false);
    expect(
      sim.world.logs.some(
        (entry) =>
          entry.kind === "warning" &&
          entry.text.includes("does not exist"),
      ),
    ).toBe(true);
    expect(
      sim.world.logs.some(
        (entry) =>
          entry.kind === "error" &&
          entry.text.includes("missing"),
      ),
    ).toBe(false);
  });

  it("continues a function after the warning", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/remove_missing.mcfunction"] = [
      "scoreboard objectives remove missing",
      "scoreboard objectives add still_here dummy",
    ].join("\n");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("function cmdlib:remove_missing");
    expect(sim.world.objectives.has("still_here")).toBe(true);
  });
});

describe("data modify string from numeric tags", () => {
  it("converts numeric tags before slicing", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("data modify storage test:str value set value -2.0f");
    sim.runCommand(
      "data modify storage test:str first set string storage test:str value 0 1",
    );
    sim.runCommand(
      "data modify storage test:str last set string storage test:str value -1",
    );
    expect(
      sim.world.storage("test:str")?.value.first.type === "string"
        ? sim.world.storage("test:str")!.value.first.value
        : null,
    ).toBe("-");
    const last = sim.world.storage("test:str")?.value.last;
    expect(last).toEqual(Tag.string("f"));
  });
});

describe("display entity matrix transformations", () => {
  it("exposes translation and scale from a 16-float matrix", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand(
      "summon item_display 0 64 0 {transformation:[1f,0f,0f,1f,0f,1f,0f,2f,0f,0f,1f,3f,0f,0f,0f,1f]}",
    );
    const entity = sim.world.entities.find(
      (candidate) => candidate.type === "minecraft:item_display",
    )!;
    const translation = getPathValues(
      entity.nbt,
      parseNbtPath("transformation.translation"),
    );
    const scale = getPathValues(
      entity.nbt,
      parseNbtPath("transformation.scale"),
    );
    expect(translation).toHaveLength(1);
    expect(scale).toHaveLength(1);
    expect(stringifySnbt(translation[0])).toBe("[1.0f, 2.0f, 3.0f]");
    expect(stringifySnbt(scale[0])).toBe("[1.0f, 1.0f, 1.0f]");
  });
});

describe("homogeneous display matrices", () => {
  it("divides translation and scale by the final matrix cell", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand(
      "summon item_display 0 64 0 {transformation:[1f,0f,0f,1f,0f,1f,0f,2f,0f,0f,1f,3f,0f,0f,0f,2f]}",
    );
    const entity = sim.world.entities.find(
      (candidate) => candidate.type === "minecraft:item_display",
    )!;
    const translation = getPathValues(
      entity.nbt,
      parseNbtPath("transformation.translation"),
    )[0];
    const scale = getPathValues(
      entity.nbt,
      parseNbtPath("transformation.scale"),
    )[0];
    expect(stringifySnbt(translation)).toBe("[0.5f, 1.0f, 1.5f]");
    expect(stringifySnbt(scale)).toBe("[0.5f, 0.5f, 0.5f]");
  });
});

describe("function command failure handling", () => {
  it("continues without logging expected probe failures", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/probe.mcfunction"] = [
      "data modify storage test:probe value set value [1f]d",
      "say AFTER-PROBE",
    ].join("\n");
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand("function cmdlib:probe");
    expect(outcome.ok).toBe(true);
    expect(
      sim.world.logs.some((entry) => entry.text.includes("AFTER-PROBE")),
    ).toBe(true);
    expect(
      sim.world.logs.some(
        (entry) =>
          entry.kind === "error" &&
          entry.text.includes("Unexpected trailing input"),
      ),
    ).toBe(false);
  });
});

describe("data get result values", () => {
  it("returns list, string and compound lengths", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand("data modify storage test:shape list set value [1,2,3]");
    sim.runCommand('data modify storage test:shape text set value "hello"');
    sim.runCommand("data modify storage test:shape obj set value {a:1,b:2}");
    expect(sim.runCommand("data get storage test:shape list").result).toBe(3);
    expect(sim.runCommand("data get storage test:shape text").result).toBe(5);
    expect(sim.runCommand("data get storage test:shape obj").result).toBe(2);
  });
});

describe("tellraw targeting", () => {
  it("does not print when no players match", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    const before = sim.world.logs.filter((entry) => entry.kind === "chat").length;
    sim.runCommand('tellraw @e[type=creeper] {"text":"SHOULD-NOT-APPEAR"}');
    const after = sim.world.logs.filter((entry) => entry.kind === "chat").length;
    expect(after).toBe(before);
    expect(
      sim.world.logs.some((entry) => entry.text.includes("SHOULD-NOT-APPEAR")),
    ).toBe(false);
    expect(
      sim.world.logs.some((entry) => entry.text.includes("tellraw to no players")),
    ).toBe(false);
  });
});

describe("shared pack context", () => {
  it("calls a function provided by a sibling pack", () => {
    const version = getVersion("26.3");
    const first = createDemoProject("26.3");
    const second = createDemoProject("26.3");
    second.id = "pack-second";
    first.files[`data/first/${version.functionFolder}/caller.mcfunction`] =
      "function second:shared\n";
    second.files[`data/second/${version.functionFolder}/shared.mcfunction`] =
      "say SHARED-CONTEXT\n";
    const sim = new Simulator({ project: first });
    sim.contextProjects = [second];
    sim.reset();
    const outcome = sim.runCommand("function first:caller");
    expect(outcome.ok).toBe(true);
    expect(
      sim.world.logs.some((entry) => entry.text.includes("SHARED-CONTEXT")),
    ).toBe(true);
  });
});

describe("/random", () => {
  it("returns values in range and accepts sequences", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    expect(sim.runCommand("random value 1..1").result).toBe(1);
    for (let i = 0; i < 20; i++) {
      const outcome = sim.runCommand("random value 1..6");
      expect(outcome.ok).toBe(true);
      expect(outcome.result).toBeGreaterThanOrEqual(1);
      expect(outcome.result).toBeLessThanOrEqual(6);
    }
    expect(sim.runCommand("random value 1..6 my_sequence").ok).toBe(true);
    expect(sim.runCommand("random reset my_sequence").ok).toBe(true);
    expect(sim.runCommand("random roll 2..2").result).toBe(2);
  });
});

describe("dynamic macro command lines", () => {
  it("executes the command supplied by the argument", () => {
    const project = createDemoProject("26.3");
    project.files["data/cmdlib/function/run_text.mcfunction"] = "$$(text)\n";
    const sim = new Simulator({ project });
    sim.reset();
    const outcome = sim.runCommand(
      'function cmdlib:run_text {text:"say MACRO-COMMAND"}',
    );
    expect(outcome.ok).toBe(true);
    expect(
      sim.world.logs.some((entry) => entry.text.includes("MACRO-COMMAND")),
    ).toBe(true);
  });
});

describe("storage text components", () => {
  it("resolves the 1.21.5 storage/nbt component form", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand('data merge storage test:storage {team:"red",message:"hello"}');
    sim.runCommand(
      'tellraw @a [{"text":"Changed team color to "},{"storage":"test:storage","nbt":"team"}]',
    );
    expect(
      sim.world.logs.some((entry) => entry.text.includes('Changed team color to "red"')),
    ).toBe(true);
    sim.runCommand(
      'tellraw @a [{"text":"Stored: "},{"storage":"test:storage","nbt":""}]',
    );
    sim.runCommand('data merge storage a {message:{text:"Short",color:"gold"}}');
    const shortRuns = renderTextComponent(
      parseSnbt('{storage:"a",nbt:"message",interpret:true}'),
      sim.world.textContext(sim.world.player()!),
    );
    expect(shortRuns.map((run) => run.text).join("")).toBe("Short");
    expect(sim.world.logs.some((entry) => entry.text.includes("Stored: "))).toBe(true);
  });
});


describe("selector text components", () => {
  it("renders the resolved entity's custom-name component", () => {
    const runs = renderTextComponent(parseSnbt('{selector:"@e"}'), {
      resolveSelectorComponents: () => [
        Tag.compound({ text: Tag.string("Guard"), color: Tag.string("gold") }),
      ],
    });
    expect(runs.map((run) => run.text).join("")).toBe("Guard");
    expect(runs[0]?.color).toBe("#FFAA00");
  });
});

describe("NBT text component interpret", () => {
  it("renders the stored NBT value as a text component", () => {
    const project = createDemoProject("26.3");
    const sim = new Simulator({ project });
    sim.reset();
    sim.runCommand(
      'data merge storage test:storage {message:{text:"Hello",color:"gold"},parts:["one","two"]}',
    );
    const component = parseSnbt('{storage:"test:storage",nbt:"message",interpret:true}');
    const runs = renderTextComponent(component, sim.world.textContext(sim.world.player()!));
    expect(runs.map((run) => run.text).join("")).toBe("Hello");
    expect(runs[0]?.color).toBe("#FFAA00");

    const raw = renderTextComponent(
      parseSnbt('{storage:"test:storage",nbt:"message"}'),
      sim.world.textContext(sim.world.player()!),
    );
    expect(raw.map((run) => run.text).join("")).toContain("Hello");
  });
});
