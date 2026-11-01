import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { snippet } from "@codemirror/autocomplete";
import {
  COMMAND_NAMES,
  COMMANDS,
  DISPLAY_SLOTS,
  ENTITY_TYPES,
  GAMEMODES,
  SCOREBOARD_CRITERIA,
  SCOREBOARD_OPERATIONS,
  TEXT_COLORS,
  TEXT_COMPONENT_KEYS,
  nbtKeysFor,
  type CommandSpec,
} from "../mc/data";
import type { Project } from "../mc/datapack";
import {
  collectObjectiveIds,
  collectScoreHolders,
  collectStorageIds,
  listFunctionIds,
  listFunctionTags,
} from "../mc/datapack";
import type { VersionProfile } from "../mc/version";
import type { World } from "../mc/world";
import { entityInfo } from "../mc/data";
import { parseSnbt } from "../mc/snbt";
import { isCompound, NbtTag, stringifySnbt } from "../mc/nbt";
import { getPathValues, parseNbtPath } from "../mc/nbtPath";

export interface CompletionIndex {
  project: Project;
  version: VersionProfile;
  functions: Array<{ id: string; path: string; hasMacros: boolean }>;
  tags: Array<{ id: string; values: string[] }>;
  objectives: string[];
  storages: string[];
  holders: string[];
  storagePaths: Map<string, string[]>;
  displaySlots: string[];
}

export function buildCompletionIndex(
  project: Project,
  version: VersionProfile,
  world?: World | null,
): CompletionIndex {
  const functions = listFunctionIds(project.files, version);
  const tags = listFunctionTags(project.files, version);
  const objectives = uniq([
    ...collectObjectiveIds(project.files),
    ...(world ? [...world.objectives.keys()] : []),
  ]);
  const storages = uniq([
    ...collectStorageIds(project.files),
    ...(world ? [...world.storages.keys()] : []),
  ]);
  const holders = uniq([
    ...collectScoreHolders(project.files),
    ...(world
      ? world.entities
          .map((e) => (e.isPlayer && e.username ? e.username : e.uuid))
          .concat(["Dev"])
      : []),
  ]);
  return {
    project,
    version,
    functions,
    tags,
    objectives,
    storages,
    holders,
    storagePaths: collectStoragePaths(project),
    displaySlots: DISPLAY_SLOTS.map((s) => s.name),
  };
}

interface Token {
  text: string;
  start: number;
  end: number;
}

export interface LineCompletion {
  from: number;
  options: Completion[];
}

/**
 * Pure completion engine. `textBefore` is the current line up to the cursor.
 * Kept free of CodeMirror state so it can be unit-tested and reused by the
 * reference panel.
 */
export function lineCompletions(
  textBefore: string,
  index: CompletionIndex,
): LineCompletion | null {
  if (textBefore.trimStart().startsWith("#")) return null;
  if (insideString(textBefore)) return null;

  const tokens = tokenize(textBefore);
  const current = tokens[tokens.length - 1];
  const currentIndex = tokens.length - 1;
  const rawCurrent = current?.text ?? "";
  const words = tokens.map((t) => t.text);

  // Where should a completion replace from?
  const inSelector = (() => {
    const open = rawCurrent.lastIndexOf("[");
    return open !== -1 && current !== undefined && rawCurrent.indexOf("]", open) === -1;
  })();
  const inBraces = (() => {
    const open = rawCurrent.lastIndexOf("{");
    return open !== -1 && current !== undefined && rawCurrent.indexOf("}", open) === -1;
  })();

  if (inSelector) {
    return selectorArgCompletion(current!, textBefore, index);
  }
  if (inBraces) {
    return nbtCompletion(textBefore, current!, words, currentIndex, index);
  }

  const command = words[0]?.replace(/^\//, "") ?? "";
  const commandTokenStart = currentIndex === 0 ? (current?.start ?? 0) : 0;

  if (currentIndex === 0) {
    return {
      from: current?.start ?? textBefore.length,
      options: commandOptions(index, current?.text ?? ""),
    };
  }

  if (!command) return null;

  if (command === "execute") {
    const runIndex = words.findIndex((w) => w === "run");
    if (runIndex !== -1 && runIndex < currentIndex) {
      const rest = words.slice(runIndex + 1);
      const subIndex = currentIndex - runIndex - 1;
      // Re-tokenize the nested command so command completion works inside run.
      const nested = lineCompletions(rest.join(" "), index);
      if (!nested) return null;
      const offset = tokens[runIndex + 1]?.start ?? textBefore.length;
      return { from: offset + nested.from, options: nested.options };
    }
    return executeCompletion(tokens, currentIndex, index);
  }

  const options = commandArgumentCompletion(command, tokens, currentIndex, index);
  if (!options || options.length === 0) return null;

  // Selector shorthand: typing @ always offers selector variables.
  const from = current?.start ?? textBefore.length;
  return { from, options };
}

function commandArgumentCompletion(
  command: string,
  tokens: Token[],
  currentIndex: number,
  index: CompletionIndex,
): Completion[] | null {
  const words = tokens.map((t) => t.text);
  const arg = currentIndex - 1;
  const current = tokens[currentIndex]?.text ?? "";

  if (current.startsWith("@")) {
    if (!current.includes("[")) return selectorVariableOptions();
    return null;
  }

  switch (command) {
    case "scoreboard":
      return scoreboardCompletion(words, currentIndex, index);
    case "title":
      return titleCompletion(arg, current, index);
    case "function":
      return functionCompletion(words, currentIndex, index);
    case "data":
      return dataCompletion(words, currentIndex, index);
    case "summon":
      return summonCompletion(arg, words, index);
    case "tag":
      return tagCompletion(arg, current, index);
    case "kill":
    case "tp":
    case "teleport":
      if (arg === 0 || arg === 1) return targetOptions(index);
      return null;
    case "tellraw":
      if (arg === 0) return targetOptions(index);
      if (arg === 1) return componentOptions();
      return null;
    case "setblock":
      if (arg === 0 || arg === 1 || arg === 2) return coordinateHint();
      if (arg === 3) return blockOptions();
      return null;
    case "return":
      if (arg === 0) return [
        keyword("run", "Run a command and return its result."),
        keyword("fail", "Return 0 and fail the function."),
      ];
      return null;
    case "reload":
      return null;
    default:
      return genericArgumentCompletion(command, words, currentIndex);
  }
}

/* --------------------------- command arguments -------------------------- */

function scoreboardCompletion(
  words: string[],
  currentIndex: number,
  index: CompletionIndex,
): Completion[] | null {
  const group = words[1];
  const action = words[2];
  if (currentIndex === 1) {
    return [
      keyword("objectives", "Create and display objectives."),
      keyword("players", "Read and write scores."),
    ];
  }
  if (currentIndex === 2) {
    if (group === "objectives") {
      return ["add", "remove", "list", "modify", "setdisplay"].map((name) =>
        keyword(name, objectiveActionInfo(name)),
      );
    }
    if (group === "players") {
      return ["set", "add", "remove", "reset", "get", "operation", "display", "enable"].map(
        (name) => keyword(name, playerActionInfo(name)),
      );
    }
    return null;
  }
  if (group === "objectives") {
    if (action === "add") {
      if (currentIndex === 3)
        return [snippetOption("objective", "${1:objective}", "A new objective name.", "new objective")];
      if (currentIndex === 4)
        return SCOREBOARD_CRITERIA.map((c) => ({
          label: c.name,
          type: "enum",
          detail: "criterion",
          info: c.description,
        }));
      if (currentIndex === 5) return componentOptions();
      return null;
    }
    if (action === "remove" || action === "modify") {
      if (currentIndex === 3) return objectiveOptions(index);
      if (action === "modify" && currentIndex === 4) {
        return [
          keyword("displayname", "Change the text shown in the sidebar."),
          keyword("rendertype", "integer or hearts."),
          keyword("numberformat", "Format the number (1.20.3+)."),
        ];
      }
      if (action === "modify" && currentIndex === 5) return componentOptions();
      return null;
    }
    if (action === "setdisplay") {
      if (currentIndex === 3)
        return index.displaySlots.map((slot) => ({
          label: slot,
          type: "enum",
          detail: "display slot",
        }));
      if (currentIndex === 4) return objectiveOptions(index);
      return null;
    }
    return null;
  }
  if (group === "players") {
    if (["set", "add", "remove"].includes(action ?? "")) {
      if (currentIndex === 3) return targetOptions(index);
      if (currentIndex === 4) return objectiveOptions(index);
      if (currentIndex === 5)
        return [snippetOption("integer", "${1:1}", "A whole number.", "score")];
      return null;
    }
    if (action === "reset") {
      if (currentIndex === 3) return targetOptions(index);
      if (currentIndex === 4) return [...objectiveOptions(index), keyword("*", "All tracked holders.")];
      return null;
    }
    if (action === "get") {
      if (currentIndex === 3) return targetOptions(index);
      if (currentIndex === 4) return objectiveOptions(index);
      return null;
    }
    if (action === "operation") {
      if (currentIndex === 3) return targetOptions(index);
      if (currentIndex === 4) return objectiveOptions(index);
      if (currentIndex === 5)
        return SCOREBOARD_OPERATIONS.map((op) => ({
          label: op.name,
          type: "operator",
          detail: "operation",
          info: op.description,
        }));
      if (currentIndex === 6) return targetOptions(index);
      if (currentIndex === 7) return objectiveOptions(index);
      return null;
    }
    if (action === "display") {
      if (currentIndex === 3) return [keyword("name", "Per-holder display name."), keyword("numberformat", "Number formatting.")];
      if (currentIndex === 4) return targetOptions(index);
      if (currentIndex === 5) return objectiveOptions(index);
      if (currentIndex === 6) return componentOptions();
      return null;
    }
    if (action === "enable") {
      if (currentIndex === 3) return targetOptions(index);
      if (currentIndex === 4) return objectiveOptions(index);
    }
  }
  return null;
}

function titleCompletion(arg: number, current: string, index: CompletionIndex): Completion[] | null {
  if (arg === 0) return targetOptions(index);
  if (arg === 1) {
    return [
      keyword("title", "Large centred title."),
      keyword("subtitle", "Line below the title."),
      keyword("actionbar", "Text above the hotbar."),
      keyword("times", "fadeIn, stay, fadeOut in ticks."),
      keyword("reset", "Clear the title and subtitle."),
      keyword("clear", "Clear title, subtitle and actionbar."),
    ];
  }
  if (arg === 2) return componentOptions();
  return null;
}

function functionCompletion(
  words: string[],
  currentIndex: number,
  index: CompletionIndex,
): Completion[] | null {
  if (currentIndex === 1) {
    return [
      ...index.functions.map((fn) => ({
        label: fn.id,
        type: "function",
        detail: fn.hasMacros ? "macro function" : "function",
        info: fn.path,
        apply: fn.hasMacros ? snippet(`${fn.id} {\${1:}}`) : `${fn.id} `,
      })),
      ...index.tags.map((tag) => ({
        label: `#${tag.id}`,
        type: "function",
        detail: "function tag",
        info: `${tag.values.length} function(s)`,
        apply: `#${tag.id} `,
      })),
      snippetOption("cmdlib:new", "cmdlib:${1:new_function}", "Create a new function id.", "function"),
    ];
  }
  if (currentIndex === 2) {
    const target = index.functions.find((f) => f.id === words[1]);
    return [
      keyword("with", "Read macro arguments from storage, an entity or a block."),
      ...(target?.hasMacros
        ? [snippetOption("arguments", "{${1:key}: ${2:value}}", "Inline macro arguments.", "compound")]
        : []),
    ];
  }
  if (words[2] === "with" && currentIndex === 3) {
    return ["storage", "entity", "block"].map((name) => keyword(name, `Read macro arguments from ${name}.`));
  }
  if (words[2] === "with" && words[3] === "storage" && currentIndex === 4) {
    return index.storages.map((id) => ({
      label: id,
      type: "storage",
      detail: "storage",
    }));
  }
  if (words[2] === "with" && currentIndex >= 5) {
    return pathOptions(index, words[4]);
  }
  if (words[2] === "with" && words[3] === "entity" && currentIndex === 4) {
    return targetOptions(index);
  }
  return null;
}

function dataCompletion(
  words: string[],
  currentIndex: number,
  index: CompletionIndex,
): Completion[] | null {
  if (currentIndex === 1) {
    return [
      keyword("get", "Read a tag and print it."),
      keyword("modify", "Change a tag in place."),
      keyword("merge", "Merge a compound into a target."),
      keyword("remove", "Delete a tag."),
    ];
  }
  const action = words[1];
  if (currentIndex === 2) {
    return [
      keyword("block", "Block entity NBT at a position."),
      keyword("entity", "Entity NBT from a selector."),
      keyword("storage", "Command storage."),
    ];
  }
  const source = words[2];
  if (!source) return null;
  if (source === "storage") {
    if (currentIndex === 3) {
      return index.storages.map((id) => ({
        label: id,
        type: "storage",
        detail: "storage",
      }));
    }
    if (action === "get" && currentIndex === 4) return pathOptions(index, words[3]);
    if (action === "get" && currentIndex === 5)
      return [snippetOption("scale", "${1:1}", "Multiply numeric tags.", "number")];
    if (action === "remove" && currentIndex === 4) return pathOptions(index, words[3]);
    if (action === "merge" && currentIndex === 4) return [snippetOption("compound", "{${1:key}: ${2:value}}", "Compound to merge.", "nbt")];
    if (action === "modify" && currentIndex === 4) return pathOptions(index, words[3]);
    if (action === "modify" && currentIndex === 5) return modifyModeOptions();
    if (action === "modify" && currentIndex === 6)
      return [
        keyword("value", "An inline NBT tag."),
        keyword("from", "Copy a tag from another source."),
        keyword("string", "Slice a string tag."),
        keyword("compute", "Evaluate a number provider (26.3)."),
      ];
    if (action === "modify" && currentIndex === 7 && words[6] === "value")
      return [snippetOption("compound", "{${1:key}: ${2:value}}", "Inline NBT.", "nbt")];
    if (action === "modify" && currentIndex === 7 && (words[6] === "from" || words[6] === "string"))
      return [keyword("block", "Block NBT."), keyword("entity", "Entity NBT."), keyword("storage", "Command storage.")];
    if (action === "modify" && currentIndex >= 8) {
      if (words[7] === "storage" && currentIndex === 8) return index.storages.map((id) => ({ label: id, type: "storage" }));
      if (words[7] === "entity" && currentIndex === 8) return targetOptions(index);
      if (currentIndex === 9) return pathOptions(index, words[8]);
    }
    return null;
  }
  if (source === "entity") {
    if (action === "get" && currentIndex === 3) return targetOptions(index);
    if (action === "get" && currentIndex === 4) return entityPathOptions(words[3], index);
    if (action === "get" && currentIndex === 5) return [snippetOption("scale", "${1:1}", "Multiply numeric tags.", "number")];
    if (action === "modify" && currentIndex === 3) return targetOptions(index);
    if (action === "modify" && currentIndex === 4) return entityPathOptions(words[3], index);
    if (action === "modify" && currentIndex === 5) return modifyModeOptions();
    if (action === "merge" && currentIndex === 3) return targetOptions(index);
    if (action === "merge" && currentIndex === 4) return [snippetOption("compound", "{${1:key}: ${2:value}}", "Compound to merge.", "nbt")];
    if (action === "remove" && currentIndex === 3) return targetOptions(index);
    if (action === "remove" && currentIndex === 4) return entityPathOptions(words[3], index);
    return null;
  }
  if (source === "block") {
    if (currentIndex <= 5) return coordinateHint();
    if (currentIndex === 6) return [snippetOption("path", "${1:key}", "Block entity path.", "path")];
    return null;
  }
  return null;
}

function summonCompletion(arg: number, words: string[], index: CompletionIndex): Completion[] | null {
  if (arg === 0) {
    return ENTITY_TYPES.map((entity) => ({
      label: entity.id.replace("minecraft:", ""),
      type: "type",
      detail: entity.category,
      info: `${entity.name} · ${entity.category}`,
      apply: entity.id.replace("minecraft:", "") + " ",
    }));
  }
  if (arg === 1) {
    return [
      snippetOption("position", "~ ~ ~", "Relative to the command source.", "coordinates"),
      snippetOption("position + nbt", "~ ~ ~ {${1:NoAI}: ${2:1b}}", "Position and NBT in one go.", "nbt"),
    ];
  }
  if (arg === 2) {
    const type = `minecraft:${(words[1] ?? "").replace(/^minecraft:/, "")}`;
    return nbtKeyOptions(type);
  }
  return null;
}

function tagCompletion(arg: number, current: string, index: CompletionIndex): Completion[] | null {
  if (arg === 0) return targetOptions(index);
  if (arg === 1) {
    return [
      keyword("add", "Add a tag."),
      keyword("remove", "Remove a tag."),
      keyword("list", "List tags."),
    ];
  }
  if (arg === 2) return [snippetOption("tag", "${1:tag}", "Entity tag name.", "tag")];
  return null;
}

const EXECUTE_SUBCOMMANDS: Array<[string, string]> = [
  ["as", "Run once per selected entity, as that entity."],
  ["at", "Use an entity's position and rotation."],
  ["positioned", "Set the command position."],
  ["align", "Floor the position to the block grid."],
  ["rotated", "Set the command rotation."],
  ["facing", "Face a position or entity."],
  ["in", "Switch dimension."],
  ["if", "Continue only if a condition is true."],
  ["unless", "Continue only if a condition is false."],
  ["store", "Store the result or success value."],
  ["run", "Run a command."],
];

function executeCompletion(
  tokens: Token[],
  currentIndex: number,
  index: CompletionIndex,
): LineCompletion | null {
  const words = tokens.map((t) => t.text);
  const from = tokens[currentIndex]?.start ?? 0;
  const sub = words[1];
  const at = currentIndex;

  const wrap = (options: Completion[] | null): LineCompletion | null =>
    options && options.length > 0 ? { from, options } : null;

  if (at === 1) {
    return wrap(
      EXECUTE_SUBCOMMANDS.map(([name, info]) =>
        keyword(name, info),
      ),
    );
  }

  if (sub === "as" || sub === "at") {
    if (at === 2) return wrap(targetOptions(index));
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "positioned") {
    if (at === 2) {
      return wrap([
        keyword("as", "Use an entity's position."),
        keyword("over", "Use an entity's position plus one block."),
        ...coordinateHint(),
      ]);
    }
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "align") {
    if (at === 2) return wrap(["x", "y", "z", "xy", "xz", "yz", "xyz"].map((v) => keyword(v, "Axes to align.")));
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "rotated") {
    if (at === 2) return wrap([keyword("as", "Use an entity's rotation."), ...coordinateHint()]);
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "facing") {
    if (at === 2) return wrap([keyword("entity", "Face an entity."), ...coordinateHint()]);
    if (at === 3 && words[2] === "entity") return wrap(targetOptions(index));
    if (at === 4 && words[2] === "entity") return wrap([keyword("feet", "Aim at the feet."), keyword("eyes", "Aim at the eyes.")]);
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "in") {
    if (at === 2) {
      return wrap(
        ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"].map((d) =>
          keyword(d, "Dimension id."),
        ),
      );
    }
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "if" || sub === "unless") {
    if (at === 2) {
      return wrap([
        keyword("entity", "Matches at least one entity."),
        keyword("score", "Compares a scoreboard value."),
        keyword("block", "Compares a block."),
        keyword("data", "Checks that an NBT path exists."),
        keyword("dimension", "Checks the dimension."),
        keyword("loaded", "Checks that a chunk is loaded."),
        keyword("items", "Checks an inventory slot (26.3)."),
        keyword("slots", "Counts matching slots (26.3)."),
      ]);
    }
    if (words[2] === "entity" && at === 3) return wrap(targetOptions(index));
    if (words[2] === "score") {
      if (at === 3) return wrap(targetOptions(index));
      if (at === 4) return wrap(objectiveOptions(index));
      if (at === 5)
        return wrap([
          keyword("=", "Equal to the source score."),
          keyword("<", "Less than the source score."),
          keyword("<=", "Less than or equal."),
          keyword(">", "Greater than the source score."),
          keyword(">=", "Greater than or equal."),
          keyword("matches", "Match a range, e.g. 1..5."),
        ]);
      if (at === 6) return wrap(targetOptions(index));
      if (at === 7) return wrap(objectiveOptions(index));
      return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
    }
    if (words[2] === "data") {
      if (at === 3) return wrap([keyword("storage", "Command storage."), keyword("entity", "Entity NBT."), keyword("block", "Block NBT.")]);
      if (at === 4 && words[3] === "storage") return wrap(index.storages.map((id) => ({ label: id, type: "storage" })));
      if (at === 4) return wrap(targetOptions(index));
      if (at === 5) return wrap(pathOptions(index));
      return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
    }
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }
  if (sub === "store") {
    if (at === 2) return wrap([keyword("result", "Store the command result."), keyword("success", "Store 1 or 0.")]);
    if (at === 3)
      return wrap([
        keyword("score", "Write into a scoreboard."),
        keyword("storage", "Write into command storage."),
        keyword("entity", "Write into entity NBT."),
        keyword("block", "Write into block NBT."),
      ]);
    const kind = words[3];
    if (kind === "score") {
      if (at === 4) return wrap(targetOptions(index));
      if (at === 5) return wrap(objectiveOptions(index));
    }
    if (kind === "storage") {
      if (at === 4) return wrap(index.storages.map((id) => ({ label: id, type: "storage" })));
      if (at === 5) return wrap(pathOptions(index));
      if (at === 6) return wrap(storeTypeOptions());
    }
    if (kind === "entity") {
      if (at === 4) return wrap(targetOptions(index));
      if (at === 5) return wrap([snippetOption("path", "${1:data.value}", "NBT path.", "path")]);
      if (at === 6) return wrap(storeTypeOptions());
    }
    if (kind === "block") {
      if (at >= 4 && at <= 6) return wrap(coordinateHint());
      if (at === 7) return wrap([snippetOption("path", "${1:data.value}", "NBT path.", "path")]);
      if (at === 8) return wrap(storeTypeOptions());
    }
    return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
  }

  return wrap(EXECUTE_SUBCOMMANDS.map(([n, i]) => keyword(n, i)));
}

function storeTypeOptions(): Completion[] {
  return ["byte", "short", "int", "long", "float", "double"].map((type) =>
    keyword(type, `Store as a ${type}.`),
  );
}

function genericArgumentCompletion(
  command: string,
  words: string[],
  currentIndex: number,
): Completion[] | null {
  const spec = COMMANDS[command];
  if (!spec) return null;
  let node: CommandSpec = spec;
  for (let i = 1; i < currentIndex; i++) {
    const child = node.children?.[words[i]];
    if (!child) return null;
    node = child;
  }
  if (!node.children) return null;
  return Object.entries(node.children).map(([name, child]) => ({
    label: name,
    type: "keyword",
    detail: child.supported ? "subcommand" : "not simulated",
    info: child.summary,
  }));
}

/* ------------------------------- selectors ------------------------------ */

const SELECTOR_ARGS = [
  ["type", "Entity type."],
  ["name", "Custom or player name."],
  ["tag", "Entity tag."],
  ["scores", "Scoreboard filters."],
  ["nbt", "NBT subset match."],
  ["distance", "Distance range."],
  ["x", "Box origin x."],
  ["y", "Box origin y."],
  ["z", "Box origin z."],
  ["dx", "Box width."],
  ["dy", "Box height."],
  ["dz", "Box depth."],
  ["limit", "Maximum results."],
  ["sort", "nearest, furthest, random, arbitrary."],
];

function selectorVariableOptions(): Completion[] {
  return [
    ["@s", "The executing entity."],
    ["@p", "Nearest player."],
    ["@a", "All players."],
    ["@e", "All entities."],
    ["@r", "Random player."],
    ["@n", "Nearest entity."],
  ].map(([label, info]) => ({
    label,
    type: "variable",
    detail: "selector",
    info,
    apply: label === "@e" ? "@e[${1:type=zombie}]" : `${label} `,
  }));
}

function selectorArgCompletion(
  token: Token,
  textBefore: string,
  index: CompletionIndex,
): LineCompletion {
  const open = token.text.lastIndexOf("[");
  let segmentStart = token.start + open + 1;
  const afterOpen = token.text.slice(open + 1);
  if (afterOpen.includes(",")) {
    segmentStart = token.start + open + 1 + afterOpen.lastIndexOf(",") + 1;
  }
  let valueStart = segmentStart;
  const segment = textBefore.slice(segmentStart);
  const eq = segment.lastIndexOf("=");
  if (eq !== -1) valueStart = segmentStart + eq + 1;
  const prefix = textBefore.slice(valueStart);
  const key = eq !== -1 ? segment.slice(0, eq).trim() : "";

  if (eq === -1) {
    const options = SELECTOR_ARGS.filter(([name]) => !segment.includes(`${name}=`)).map(
      ([name, info]) => ({
        label: `${name}=`,
        type: "property",
        detail: "selector argument",
        info,
      }),
    );
    return { from: segmentStart + segment.length - segment.trimStart().length + (segment.length - segment.trimStart().length === 0 ? 0 : 0), options };
  }

  if (key === "type") {
    return {
      from: valueStart,
      options: ENTITY_TYPES.map((entity) => ({
        label: entity.id.replace("minecraft:", ""),
        type: "type",
        detail: entity.category,
        info: entity.name,
        apply: entity.id.replace("minecraft:", ""),
      })),
    };
  }
  if (key === "sort") {
    return {
      from: valueStart,
      options: ["nearest", "furthest", "random", "arbitrary"].map((v) => keyword(v, "Selector sort order.")),
    };
  }
  if (key === "scores") {
    return {
      from: valueStart,
      options: index.objectives.map((name) => ({
        label: name,
        type: "property",
        detail: "objective",
        apply: `${name}=${"${1:1..}"}`,
      })),
    };
  }
  if (key === "tag") {
    const tags = uniq(
      Object.values(index.project.files)
        .flatMap((content) => [...content.matchAll(/\btag\s+([A-Za-z0-9_./+-]+)/g)].map((m) => m[1])),
    );
    return {
      from: valueStart,
      options: tags.map((tag) => ({ label: tag, type: "tag", detail: "entity tag" })),
    };
  }
  void prefix;
  return { from: valueStart, options: [] };
}

/* ------------------------------- NBT/keys ------------------------------- */

function nbtCompletion(
  textBefore: string,
  token: Token,
  words: string[],
  currentIndex: number,
  index: CompletionIndex,
): LineCompletion | null {
  const open = token.text.lastIndexOf("{");
  const inside = token.text.slice(open + 1);
  let segmentStart = token.start + open + 1;
  if (inside.includes(",")) {
    segmentStart = token.start + open + 1 + inside.lastIndexOf(",") + 1;
  }
  const segment = textBefore.slice(segmentStart);
  const colon = segment.lastIndexOf(":");
  const command = words[0]?.replace(/^\//, "");
  const entityType = guessEntityType(words, currentIndex);

  if (colon !== -1) {
    const key = segment.slice(0, colon).trim().replace(/^"/, "");
    if (key === "color") {
      return {
        from: segmentStart + colon + 1,
        options: TEXT_COLORS.map((color) => ({ label: color, type: "enum", detail: "text colour" })),
      };
    }
    if (key === "objective") {
      return {
        from: segmentStart + colon + 1,
        options: objectiveOptions(index),
      };
    }
    if (key === "name" || key === "selector") {
      return {
        from: segmentStart + colon + 1,
        options: targetOptions(index),
      };
    }
    if (key === "type" && command === "summon") {
      return {
        from: segmentStart + colon + 1,
        options: ENTITY_TYPES.map((e) => ({ label: e.id.replace("minecraft:", ""), type: "type" })),
      };
    }
    if (["text", "translate", "fallback", "font", "format"].includes(key)) {
      return null;
    }
    return {
      from: segmentStart + colon + 1,
      options: [
        snippetOption("string", '"${1:text}"', "String tag.", "string"),
        snippetOption("integer", "${1:1}", "Integer tag.", "number"),
        snippetOption("byte", "${1:1}b", "Byte tag.", "number"),
        snippetOption("double", "${1:1.0}d", "Double tag.", "number"),
        keyword("true", "Boolean true (1b)."),
        keyword("false", "Boolean false (0b)."),
      ],
    };
  }

  const keys = isTextComponentContext(command, words, currentIndex)
    ? TEXT_COMPONENT_KEYS
    : nbtKeysFor(entityType).map((k) => ({ key: k.key, description: `${k.type} — ${k.description}` }));

  return {
    from: segmentStart,
    options: keys.map((entry) => ({
      label: `${entry.key}:`,
      type: "property",
      detail: "NBT key",
      info: entry.description,
    })),
  };
}

function isTextComponentContext(command: string, words: string[], currentIndex: number): boolean {
  if (command === "title") return words.length > 2 && ["title", "subtitle", "actionbar"].includes(words[2]);
  if (command === "tellraw") return currentIndex >= 2;
  if (command === "say" || command === "me") return false;
  return words.some((w) => w === "{" || w.includes('"text"') || w.includes("'text'"));
}

function guessEntityType(words: string[], currentIndex: number): string {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const type = /type=(!?)([a-z0-9_]+)/.exec(words[i]);
    if (type) return `minecraft:${type[2].replace(/^minecraft:/, "")}`;
    if (words[i] === "summon") return `minecraft:${(words[i + 1] ?? "").replace(/^minecraft:/, "")}`;
  }
  return "minecraft:player";
}

function nbtKeyOptions(type: string): Completion[] {
  return nbtKeysFor(type).map((key) => ({
    label: `${key.key}:`,
    type: "property",
    detail: key.type,
    info: key.description,
  }));
}

/* ------------------------------- primitives ----------------------------- */

function commandOptions(index: CompletionIndex, prefix: string): Completion[] {
  const is263 = index.version.id === "26.3";
  const commands = COMMAND_NAMES.filter((name) => {
    const spec = COMMANDS[name];
    if (spec.since === "26.3" && !is263) return false;
    return true;
  });
  const options: Completion[] = commands.map((name) => {
    const spec = COMMANDS[name];
    return {
      label: name,
      type: "keyword",
      detail: spec.supported ? "simulated" : "not simulated",
      info: spec.summary,
      apply: `${name} `,
      boost: spec.supported ? 1 : 0,
    };
  });
  if ("tp".startsWith(prefix)) {
    options.push({ label: "tp", type: "keyword", detail: "alias", info: "Alias for /teleport.", apply: "tp " });
  }
  return options;
}

function objectiveActionInfo(name: string): string {
  switch (name) {
    case "add":
      return "Create a new objective.";
    case "remove":
      return "Delete an objective and its scores.";
    case "list":
      return "List every objective.";
    case "modify":
      return "Change the display name or render type.";
    case "setdisplay":
      return "Put an objective in a display slot.";
    default:
      return name;
  }
}

function playerActionInfo(name: string): string {
  switch (name) {
    case "set":
      return "Set a score.";
    case "add":
      return "Add to a score.";
    case "remove":
      return "Subtract from a score.";
    case "reset":
      return "Delete a score.";
    case "get":
      return "Print a score.";
    case "operation":
      return "Combine two scores.";
    case "display":
      return "Set a per-holder display name.";
    case "enable":
      return "Enable a trigger objective.";
    default:
      return name;
  }
}

function objectiveOptions(index: CompletionIndex): Completion[] {
  return index.objectives.map((name) => ({
    label: name,
    type: "variable",
    detail: "objective",
  }));
}

function targetOptions(index: CompletionIndex): Completion[] {
  return [
    ...selectorVariableOptions(),
    ...index.holders.map((holder) => ({
      label: holder,
      type: "variable",
      detail: "score holder",
    })),
  ];
}

function pathOptions(index: CompletionIndex, storageId?: string): Completion[] {
  const paths = (storageId && index.storagePaths.get(storageId)) || [];
  return [
    ...paths.map((path) => ({ label: path, type: "property", detail: "NBT path" })),
    snippetOption("path", "${1:path}", "A dotted NBT path, e.g. config.enabled", "path"),
  ];
}

function entityPathOptions(selector: string, index: CompletionIndex): Completion[] {
  const type = /type=(!?)([a-z0-9_]+)/.exec(selector)?.[2];
  const nbtKeys = nbtKeysFor(type ? `minecraft:${type.replace(/^minecraft:/, "")}` : "minecraft:player");
  return nbtKeys.map((key) => ({
    label: key.key,
    type: "property",
    detail: key.type,
    info: key.description,
  }));
}

function componentOptions(): Completion[] {
  return [
    snippetOption("text component", '{"text":"${1:Hello}"}', "A plain text component.", "text"),
    snippetOption("gold title", '{"text":"${1:Hello}","color":"gold","bold":true}', "Styled text.", "text"),
    snippetOption("score", '{"score":{"name":"${1:@s}","objective":"${2:points}"}}', "Read a scoreboard value.", "text"),
    snippetOption("selector", '{"selector":"${1:@a}"}', "Render matched entity names.", "text"),
    snippetOption(
      "multi-part",
      '{"text":"${1:Hello}","extra":[{"text":" ${2:world}","color":"aqua"}]}',
      "Parent component with children.",
      "text",
    ),
  ];
}

function modifyModeOptions(): Completion[] {
  return [
    keyword("set", "Replace the tag."),
    keyword("merge", "Merge a compound into the tag."),
    keyword("append", "Append to a list."),
    keyword("prepend", "Prepend to a list."),
    keyword("insert", "Insert at an index."),
    keyword("remove", "Remove the tag."),
  ];
}

function blockOptions(): Completion[] {
  return [
    "stone", "dirt", "grass_block", "cobblestone", "oak_planks", "oak_log",
    "glass", "sand", "gravel", "iron_block", "gold_block", "diamond_block",
    "redstone_block", "command_block", "barrier", "light", "chest", "barrel",
  ].map((id) => ({
    label: `minecraft:${id}`,
    type: "type",
    detail: "block",
  }));
}

function coordinateHint(): Completion[] {
  return [
    snippetOption("relative", "~ ~ ~", "Relative to the command source.", "coordinates"),
    snippetOption("absolute", "${1:0} ${2:64} ${3:0}", "Absolute world position.", "coordinates"),
  ];
}

function keyword(label: string, info: string): Completion {
  return { label, type: "keyword", info };
}

function snippetOption(label: string, template: string, info: string, detail: string): Completion {
  return {
    label,
    detail,
    info,
    type: "text",
    apply: snippet(template),
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

/* ------------------------------ tokenizer ------------------------------- */

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let start = -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      if (start === -1) start = i;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
      if (start === -1) start = i;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth = Math.max(0, depth - 1);
      if (start === -1) start = i;
      continue;
    }
    if (/\s/.test(ch) && depth === 0) {
      if (start !== -1) {
        tokens.push({ text: text.slice(start, i), start, end: i });
        start = -1;
      }
      continue;
    }
    if (start === -1) start = i;
  }
  if (start !== -1) {
    tokens.push({ text: text.slice(start), start, end: text.length });
  } else {
    tokens.push({ text: "", start: text.length, end: text.length });
  }
  return tokens;
}

function insideString(text: string): boolean {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    }
  }
  return quote !== null;
}

function collectStoragePaths(project: Project): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (id: string, path: string) => {
    const list = map.get(id) ?? [];
    if (path && !list.includes(path)) list.push(path);
    map.set(id, list);
  };
  for (const content of Object.values(project.files)) {
    const regex = /data\s+(?:modify|merge|get|remove)\s+storage\s+([a-z0-9_.-]+(?::[a-z0-9_./-]+)?)\s+([^\s]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const id = match[1].includes(":") ? match[1] : `minecraft:${match[1]}`;
      const path = match[2];
      add(id, path);
      add(id, path.split(/[.[]/)[0]);
    }
    const valueRegex = /data\s+modify\s+storage\s+([a-z0-9_.-]+(?::[a-z0-9_./-]+)?)\s+([^\s]+)\s+(?:set|merge)\s+value\s+(\{[^\n]*\}|\[[^\n]*\])/g;
    while ((match = valueRegex.exec(content))) {
      try {
        const id = match[1].includes(":") ? match[1] : `minecraft:${match[1]}`;
        const basePath = match[2];
        const tag = parseSnbt(match[3]);
        if (isCompound(tag)) {
          for (const key of Object.keys(tag.value)) {
            add(id, joinPath(basePath, key));
          }
        }
      } catch {
        // Lint reports malformed SNBT separately.
      }
    }
  }
  return map;
}

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

/** Resolve a path such as `a.b[0].c` against a tag; used by tests and docs. */
export function samplePath(tag: NbtTag, path: string): string {
  return getPathValues(tag, parseNbtPath(path)).map((v) => stringifySnbt(v)).join(", ");
}

/* --------------------------- CodeMirror source -------------------------- */

export function createCompletionSource(
  getIndex: () => CompletionIndex,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);
    if (textBefore.trim().length === 0 && !context.explicit) return null;
    const result = lineCompletions(textBefore, getIndex());
    if (!result || result.options.length === 0) return null;
    return {
      from: line.from + result.from,
      options: result.options,
      validFor: /^[^\s]*$/,
    };
  };
}
