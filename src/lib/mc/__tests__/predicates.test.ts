import { describe, expect, it } from "vitest";
import {
  collectPredicateConditionTypes,
  collectPredicateReferences,
  evaluatePredicate,
  findPredicateCycles,
  parsePredicateFiles,
  type PredicateContext,
  type PredicateDefinition,
} from "../predicates";
import { makeWorld } from "../world";
import type { World } from "../world";
import { createEntity, entityPos } from "../entities";
import { createProject, type Project } from "../datapack";
import { Simulator } from "../simulator";
import { lintProject } from "../../lint";

function predicate(id: string, condition: Record<string, unknown>): PredicateDefinition {
  const [namespace, name] = id.split(":");
  return {
    id,
    path: `data/${namespace}/predicate/${name}.json`,
    data: condition,
  };
}

function projectPredicatePath(id: string): string {
  const [namespace, name] = id.split(":");
  return `data/${namespace}/predicate/${name}.json`;
}

function contextFor(world: World): PredicateContext {
  const source = world.player() ?? null;
  return {
    source,
    pos: source ? entityPos(source) : { x: 0, y: 64, z: 0 },
    dimension: "minecraft:overworld",
  };
}

describe("predicate parsing", () => {
  it("loads valid files and reports malformed and incomplete ones", () => {
    const parsed = parsePredicateFiles({
      "data/test/predicate/ok.json": JSON.stringify({
        condition: "minecraft:all_of",
        terms: [],
      }),
      "data/test/predicate/broken.json": "{ not json",
      "data/test/predicate/missing.json": JSON.stringify({ terms: [] }),
      "data/test/predicate/nested.json": JSON.stringify({
        condition: {
          condition: "minecraft:entity_present",
          entity: "@s",
        },
      }),
    });
    expect([...parsed.predicates.keys()].sort()).toEqual(["test:nested", "test:ok"]);
    const codes = parsed.errors.map((error) => error.code);
    expect(codes).toContain("invalid-predicate-json");
    expect(codes).toContain("missing-condition");
  });

  it("rejects invalid ids", () => {
    const parsed = parsePredicateFiles({
      "data/Bad/predicate/test.json": JSON.stringify({ condition: "minecraft:all_of" }),
    });
    expect(parsed.predicates.size).toBe(0);
    expect(parsed.errors[0]?.code).toBe("invalid-predicate-id");
  });
});

describe("predicate evaluation", () => {
  it("supports all_of, any_of and inverted", () => {
    const world = makeWorld("26.3");
    world.setPredicates([
      predicate("test:all", {
        condition: "minecraft:all_of",
        terms: [
          { condition: "minecraft:entity_present", entity: "@s" },
          {
            condition: "minecraft:inverted",
            term: { condition: "minecraft:entity_present", entity: "@e[type=zombie]" },
          },
        ],
      }),
      predicate("test:any", {
        condition: "minecraft:any_of",
        terms: [
          { condition: "minecraft:entity_present", entity: "@e[type=zombie]" },
          { condition: "minecraft:entity_present", entity: "@s" },
        ],
      }),
    ]);
    const context = contextFor(world);
    expect(evaluatePredicate(world, "test:all", context)).toBe(true);
    expect(evaluatePredicate(world, "test:any", context)).toBe(true);
  });

  it("resolves references and is cycle-safe", () => {
    const world = makeWorld("26.3");
    world.setPredicates([
      predicate("test:player", {
        condition: "minecraft:entity_properties",
        entity: "this",
        predicate: { type: "minecraft:player" },
      }),
      predicate("test:alias", {
        condition: "minecraft:reference",
        id: "test:player",
      }),
      predicate("test:a", { condition: "minecraft:reference", id: "test:b" }),
      predicate("test:b", { condition: "minecraft:reference", id: "test:a" }),
    ]);
    const context = contextFor(world);
    expect(evaluatePredicate(world, "test:player", context)).toBe(true);
    expect(evaluatePredicate(world, "test:alias", context)).toBe(true);
    expect(evaluatePredicate(world, "test:a", context)).toBe(false);
    expect(findPredicateCycles(world.predicates).length).toBe(1);
  });

  it("checks entity types, flags and nbt", () => {
    const world = makeWorld("26.3");
    world.addEntity(createEntity("minecraft:zombie", { x: 0, y: 64, z: 0 }));
    world.setPredicates([
      predicate("test:is_player", {
        condition: "minecraft:entity_properties",
        entity: "this",
        predicate: { type: "minecraft:player" },
      }),
      predicate("test:is_zombie", {
        condition: "minecraft:entity_properties",
        entity: "@e[type=zombie]",
        predicate: { type: "minecraft:zombie", flags: { is_on_fire: false } },
      }),
      predicate("test:has_tag", {
        condition: "minecraft:entity_properties",
        entity: "this",
        predicate: { nbt: "{Health:20.0f}" },
      }),
    ]);
    const context = contextFor(world);
    expect(evaluatePredicate(world, "test:is_player", context)).toBe(true);
    expect(evaluatePredicate(world, "test:is_zombie", context)).toBe(true);
    expect(evaluatePredicate(world, "test:has_tag", context)).toBe(true);
  });

  it("checks score ranges", () => {
    const world = makeWorld("26.3");
    world.addObjective("points", "dummy");
    world.setScore("Dev", "points", 7);
    world.setPredicates([
      predicate("test:in_range", {
        condition: "minecraft:score",
        target: "@s",
        objective: "points",
        range: "5..10",
      }),
      predicate("test:out_of_range", {
        condition: "minecraft:score",
        target: "@s",
        objective: "points",
        range: "1..5",
      }),
      predicate("test:entity_scores", {
        condition: "minecraft:entity_scores",
        entity: "this",
        scores: { points: { min: 7, max: 7 } },
      }),
    ]);
    const context = contextFor(world);
    expect(evaluatePredicate(world, "test:in_range", context)).toBe(true);
    expect(evaluatePredicate(world, "test:out_of_range", context)).toBe(false);
    expect(evaluatePredicate(world, "test:entity_scores", context)).toBe(true);
  });

  it("checks location ranges, dimensions and blocks", () => {
    const world = makeWorld("26.3");
    world.setBlock({ x: 0, y: 64, z: 0 }, "minecraft:stone");
    world.setPredicates([
      predicate("test:here", {
        condition: "minecraft:location_check",
        dimension: "minecraft:overworld",
        position: { x: "-1..1", y: 64, z: "-1..1" },
        block: "minecraft:stone",
        fluid: "minecraft:empty",
      }),
      predicate("test:nether", {
        condition: "minecraft:location_check",
        dimension: "minecraft:the_nether",
      }),
    ]);
    const context = contextFor(world);
    expect(evaluatePredicate(world, "test:here", context)).toBe(true);
    expect(evaluatePredicate(world, "test:nether", context)).toBe(false);
  });

  it("handles deterministic random chances and time checks", () => {
    const world = makeWorld("26.3");
    world.tick = 13000;
    world.setPredicates([
      predicate("test:never", { condition: "minecraft:random_chance", chance: 0 }),
      predicate("test:always", { condition: "minecraft:random_chance", chance: 1 }),
      predicate("test:night", {
        condition: "minecraft:time_check",
        value: "13000..15000",
      }),
      predicate("test:weather", { condition: "minecraft:weather_check" }),
      predicate("test:value", {
        condition: "minecraft:value_check",
        value: 5,
        range: "1..10",
      }),
    ]);
    const context = contextFor(world);
    expect(evaluatePredicate(world, "test:never", context)).toBe(false);
    expect(evaluatePredicate(world, "test:always", context)).toBe(true);
    expect(evaluatePredicate(world, "test:night", context)).toBe(true);
    expect(evaluatePredicate(world, "test:weather", context)).toBe(false);
    expect(evaluatePredicate(world, "test:value", context)).toBe(true);
  });

  it("evaluates unsupported conditions as false without throwing", () => {
    const world = makeWorld("26.3");
    world.setPredicates([
      predicate("test:future", { condition: "minecraft:not_implemented_yet" }),
    ]);
    expect(evaluatePredicate(world, "test:future", contextFor(world))).toBe(false);
    expect(
      collectPredicateConditionTypes({ condition: "minecraft:not_implemented_yet" }),
    ).toEqual(["not_implemented_yet"]);
    expect(
      collectPredicateReferences({
        condition: "minecraft:reference",
        id: "test:future",
      }),
    ).toEqual(["test:future"]);
  });
});

describe("execute if/unless predicate", () => {
  function simWithPredicates(): Simulator {
    const project = createProject("26.3");
    project.files[projectPredicatePath("cmdlib:always")] = JSON.stringify({
      condition: "minecraft:all_of",
      terms: [],
    });
    project.files[projectPredicatePath("cmdlib:never")] = JSON.stringify({
      condition: "minecraft:entity_present",
      entity: "@e[type=zombie]",
    });
    const sim = new Simulator({ project });
    sim.reset();
    return sim;
  }

  it("loads predicates from project files on setProject/reset", () => {
    const sim = simWithPredicates();
    expect(sim.world.getPredicate("cmdlib:always")).toBeTruthy();
    expect(sim.world.predicateIds()).toContain("cmdlib:always");
  });

  it("runs if and unless correctly", () => {
    const sim = simWithPredicates();
    expect(
      sim.runCommand("execute if predicate cmdlib:always run say yes").success,
    ).toBe(true);
    expect(
      sim.runCommand("execute if predicate cmdlib:never run say no").success,
    ).toBe(false);
    expect(
      sim.runCommand("execute unless predicate cmdlib:never run say ok").success,
    ).toBe(true);
  });

  it("evaluates against the current dimension", () => {
    const sim = simWithPredicates();
    expect(
      sim.runCommand(
        "execute in minecraft:the_nether if predicate cmdlib:always run say nether",
      ).success,
    ).toBe(true);
  });
});

describe("predicate linting", () => {
  function lintProjectWith(
    predicateFiles: Record<string, unknown>,
    functionLine: string,
  ) {
    const project: Project = createProject("26.3");
    for (const [id, data] of Object.entries(predicateFiles)) {
      project.files[projectPredicatePath(id)] = JSON.stringify(data);
    }
    project.files["data/cmdlib/function/check.mcfunction"] = functionLine;
    return lintProject(project);
  }

  it("reports malformed JSON and missing conditions", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/predicate/broken.json"] = "{";
    project.files["data/cmdlib/predicate/missing.json"] = JSON.stringify({});
    const report = lintProject(project);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("invalid-predicate-json");
    expect(codes).toContain("missing-condition");
    expect(report.errors).toBeGreaterThanOrEqual(2);
  });

  it("errors on an unknown predicate in execute if predicate", () => {
    const report = lintProjectWith(
      {},
      "execute if predicate cmdlib:missing run say hi",
    );
    expect(report.diagnostics.map((d) => d.code)).toContain("unknown-predicate");
    expect(report.errors).toBeGreaterThan(0);
  });

  it("accepts valid predicate files without false errors", () => {
    const report = lintProjectWith(
      {
        "cmdlib:always": { condition: "minecraft:all_of", terms: [] },
        "cmdlib:player": {
          condition: "minecraft:entity_properties",
          entity: "this",
          predicate: { type: "minecraft:player" },
        },
        "cmdlib:alias": { condition: "minecraft:reference", id: "cmdlib:player" },
      },
      "execute if predicate cmdlib:alias run say hi",
    );
    expect(report.errors).toBe(0);
  });

  it("warns about unsupported condition types", () => {
    const report = lintProjectWith(
      { "cmdlib:future": { condition: "minecraft:future_condition" } },
      "execute if predicate cmdlib:future run say hi",
    );
    const diagnostic = report.diagnostics.find(
      (d) => d.code === "unsupported-predicate-condition",
    );
    expect(diagnostic?.severity).toBe("warning");
    expect(report.errors).toBe(0);
  });

  it("reports predicate reference cycles", () => {
    const report = lintProjectWith(
      {
        "cmdlib:a": { condition: "minecraft:reference", id: "cmdlib:b" },
        "cmdlib:b": { condition: "minecraft:reference", id: "cmdlib:a" },
      },
      "execute if predicate cmdlib:a run say hi",
    );
    expect(report.diagnostics.map((d) => d.code)).toContain("predicate-cycle");
  });
});
