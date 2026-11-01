import { describe, expect, it } from "vitest";
import {
  TAG_KINDS,
  TAG_KIND_META,
  detectTagKind,
  isTagKind,
  normalizeResourceLocation,
  parseTagEntry,
  parseTagPath,
  tagFolderFor,
  tagPathFor,
  validateTagValue,
} from "../tag-kinds";
import { createProject, parseDatapack } from "../datapack";
import { lintProject } from "../../lint";
import { getVersion } from "../version";

const v263 = getVersion("26.3");
const v204 = getVersion("1.20.4");

const PLURAL_FOLDERS: Record<(typeof TAG_KINDS)[number], string> = {
  function: "tags/functions",
  item: "tags/items",
  block: "tags/blocks",
  entity_type: "tags/entity_types",
  fluid: "tags/fluids",
  game_event: "tags/game_events",
};

describe("tag kind metadata", () => {
  it("describes every supported kind", () => {
    for (const kind of TAG_KINDS) {
      const meta = TAG_KIND_META[kind];
      expect(meta.kind).toBe(kind);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.pluralLabel.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.examples.length).toBeGreaterThan(0);
      expect(meta.valueKind).toBe(kind);
    }
    expect(TAG_KIND_META.function.requiresFunctionTarget).toBe(true);
    for (const kind of TAG_KINDS.filter((candidate) => candidate !== "function")) {
      expect(TAG_KIND_META[kind].requiresFunctionTarget).toBe(false);
    }
  });

  it("recognises kind names", () => {
    expect(isTagKind("item")).toBe(true);
    expect(isTagKind("entity_type")).toBe(true);
    expect(isTagKind("items")).toBe(false);
  });
});

describe("tag folders and paths per version", () => {
  it("uses singular folders on 26.3", () => {
    for (const kind of TAG_KINDS) {
      expect(tagFolderFor(kind, v263)).toBe(`tags/${kind}`);
    }
  });

  it("uses plural folders on 1.20.4", () => {
    for (const kind of TAG_KINDS) {
      expect(tagFolderFor(kind, v204)).toBe(PLURAL_FOLDERS[kind]);
    }
  });

  it("builds full tag paths", () => {
    expect(tagPathFor("item", "mypack", "ores/iron", v263)).toBe(
      "data/mypack/tags/item/ores/iron.json",
    );
    expect(tagPathFor("block", "mypack", "stone", v204)).toBe(
      "data/mypack/tags/blocks/stone.json",
    );
    expect(tagPathFor("entity_type", "mypack", "#zombies", v263)).toBe(
      "data/mypack/tags/entity_type/zombies.json",
    );
  });

  it("detects kinds from paths, including nested names", () => {
    expect(detectTagKind("data/minecraft/tags/item/ores/iron.json", v263)).toBe("item");
    expect(detectTagKind("data/minecraft/tags/entity_types/zombies.json", v204)).toBe(
      "entity_type",
    );
    expect(detectTagKind("data/minecraft/tags/game_event/vibrations.json", v263)).toBe(
      "game_event",
    );
    // A legacy plural folder is wrong on the new version and vice versa.
    expect(detectTagKind("data/minecraft/tags/items/ores.json", v263)).toBeNull();
    expect(detectTagKind("data/minecraft/tags/item/ores.json", v204)).toBeNull();
    expect(detectTagKind("data/minecraft/tags/damage_type/fire.json", v263)).toBeNull();
    expect(detectTagKind("data/minecraft/function/load.mcfunction", v263)).toBeNull();
  });

  it("parses path components", () => {
    expect(parseTagPath("data/mypack/tags/fluid/lava.json", v263)).toEqual({
      kind: "fluid",
      namespace: "mypack",
      name: "lava",
      folder: "tags/fluid",
    });
    expect(parseTagPath("data/mypack/tags/items/lava.json", v263)).toBeNull();
  });
});

describe("tag value validation", () => {
  it("accepts each kind's example values and normalises namespaces", () => {
    for (const kind of TAG_KINDS) {
      const meta = TAG_KIND_META[kind];
      for (const example of meta.examples) {
        const info = validateTagValue(kind, example);
        expect(info.ok, `${kind} ${example}`).toBe(true);
        expect(info.reference).toBe(example.startsWith("#"));
        expect(info.id).not.toContain("#");
        expect(info.id).toContain(":");
      }
    }
    expect(validateTagValue("item", "stone").id).toBe("minecraft:stone");
    expect(validateTagValue("function", "#minecraft:tick").reference).toBe(true);
  });

  it("rejects malformed ids and references", () => {
    for (const value of ["", "#", "Minecraft:Stone", "minecraft:", ":stone", "minecraft:stone:extra", "minecraft:stone//x", "minecraft:stone/"]) {
      const info = validateTagValue("item", value);
      expect(info.ok, value).toBe(false);
      expect(info.message).toBeTruthy();
    }
  });

  it("normalises resource locations", () => {
    expect(normalizeResourceLocation("stone")).toBe("minecraft:stone");
    expect(normalizeResourceLocation("mypack:ores/iron")).toBe("mypack:ores/iron");
    expect(normalizeResourceLocation("minecraft:")).toBeNull();
    expect(normalizeResourceLocation("Mine:stone")).toBeNull();
  });
});

describe("tag entries", () => {
  it("accepts strings, # references and { id, required } objects", () => {
    const stringEntry = parseTagEntry("item", "minecraft:stone");
    expect(stringEntry.ok).toBe(true);
    expect(stringEntry.required).toBe(true);

    const reference = parseTagEntry("block", "#minecraft:logs");
    expect(reference.ok).toBe(true);
    expect(reference.reference).toBe(true);
    expect(reference.id).toBe("minecraft:logs");

    const optional = parseTagEntry("entity_type", {
      id: "minecraft:zombie",
      required: false,
    });
    expect(optional.ok).toBe(true);
    expect(optional.required).toBe(false);

    const optionalReference = parseTagEntry("item", {
      id: "#minecraft:planks",
      required: false,
    });
    expect(optionalReference.ok).toBe(true);
    expect(optionalReference.reference).toBe(true);
    expect(optionalReference.required).toBe(false);
  });

  it("rejects malformed object entries", () => {
    expect(parseTagEntry("item", { required: true }).ok).toBe(false);
    expect(parseTagEntry("item", { id: 42 }).ok).toBe(false);
    expect(parseTagEntry("item", { id: "minecraft:stone", required: "yes" }).ok).toBe(false);
    expect(parseTagEntry("item", ["minecraft:stone"]).ok).toBe(false);
  });
});

describe("parseDatapack tags", () => {
  it("parses non-function tags and keeps function tags separate", () => {
    const parsed = parseDatapack(
      {
        "data/example/tags/item/ores.json": JSON.stringify({
          values: ["minecraft:iron_ore", { id: "#minecraft:coal_ores", required: false }],
        }),
        "data/example/tags/function/load.json": JSON.stringify({
          values: ["example:boot"],
        }),
        "data/example/function/boot.mcfunction": "",
      },
      v263,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.tags.map((tag) => tag.id)).toEqual(["example:load"]);
    expect(parsed.tags[0].values).toEqual(["example:boot"]);
    expect(parsed.allTags).toHaveLength(2);
    const item = parsed.allTags.find((tag) => tag.kind === "item")!;
    expect(item.id).toBe("example:ores");
    expect(item.values).toEqual(["minecraft:iron_ore", "#minecraft:coal_ores"]);
    expect(item.entries[1].required).toBe(false);
  });

  it("accepts legacy plural folders on 1.20.4", () => {
    const parsed = parseDatapack(
      { "data/example/tags/items/ores.json": JSON.stringify({ values: [] }) },
      v204,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.allTags[0].kind).toBe("item");
  });

  it("reports wrong folders for the target version", () => {
    const parsed = parseDatapack(
      { "data/example/tags/items/ores.json": JSON.stringify({ values: [] }) },
      v263,
    );
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].code).toBe("invalid-folder");
    expect(parsed.errors[0].message).toContain("tags/item");
  });

  it("reports malformed JSON, missing values and invalid entries", () => {
    const malformed = parseDatapack(
      { "data/example/tags/item/broken.json": "{ values: [" },
      v263,
    );
    expect(malformed.errors[0].code).toBe("invalid-tag-json");

    const missing = parseDatapack(
      { "data/example/tags/item/empty.json": JSON.stringify({}) },
      v263,
    );
    expect(missing.errors[0].code).toBe("missing-tag-values");

    const invalid = parseDatapack(
      {
        "data/example/tags/item/bad.json": JSON.stringify({
          values: ["minecraft:stone", "Not An Id"],
        }),
      },
      v263,
    );
    expect(invalid.errors).toHaveLength(1);
    expect(invalid.errors[0].code).toBe("invalid-tag-value");
    expect(invalid.errors[0].valueIndex).toBe(1);
    expect(invalid.allTags[0].values).toEqual(["minecraft:stone"]);
  });
});

describe("tag lint integration", () => {
  it("does not report unknown functions for item/block/entity/fluid/game_event tags", () => {
    const project = createProject("26.3");
    for (const kind of ["item", "block", "entity_type", "fluid", "game_event"] as const) {
      project.files[tagPathFor(kind, "cmdlib", "example", v263)] = JSON.stringify({
        values: [TAG_KIND_META[kind].examples[0], "#minecraft:example"],
      });
    }
    const report = lintProject(project);
    expect(report.errors).toBe(0);
    expect(report.diagnostics.some((d) => d.code === "unknown-function")).toBe(false);
    expect(report.diagnostics.some((d) => d.code === "unknown-function-tag")).toBe(false);
  });

  it("does not mark functions as used from non-function tags", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/function/helper.mcfunction"] = "# helper\n";
    project.files["data/cmdlib/tags/item/helpers.json"] = JSON.stringify({
      values: ["cmdlib:helper"],
    });
    const report = lintProject(project);
    expect(
      report.diagnostics.some(
        (d) => d.code === "unused-function" && d.path.endsWith("helper.mcfunction"),
      ),
    ).toBe(true);
  });

  it("keeps function existence checks for function tags", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/tags/function/broken.json"] = JSON.stringify({
      values: ["cmdlib:does_not_exist"],
    });
    const report = lintProject(project);
    const diagnostic = report.diagnostics.find((d) => d.code === "unknown-function");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.path).toBe("data/cmdlib/tags/function/broken.json");
  });

  it("honours optional function entries", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/tags/function/optional.json"] = JSON.stringify({
      values: [{ id: "cmdlib:does_not_exist", required: false }],
    });
    const report = lintProject(project);
    expect(report.diagnostics.some((d) => d.code === "unknown-function")).toBe(false);
  });

  it("reports malformed non-function tag JSON", () => {
    const project = createProject("26.3");
    project.files["data/cmdlib/tags/block/broken.json"] = "{ nope";
    const report = lintProject(project);
    const diagnostic = report.diagnostics.find((d) => d.code === "invalid-tag-json");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.path).toBe("data/cmdlib/tags/block/broken.json");
  });
});
