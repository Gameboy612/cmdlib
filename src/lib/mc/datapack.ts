import type { FunctionDef, FunctionTag } from "./world";
import { VersionProfile, getVersion, splitId } from "./version";

export interface Project {
  name: string;
  versionId: string;
  files: Record<string, string>;
  activePath: string;
  updatedAt: number;
}

export interface ParsedDatapack {
  functions: FunctionDef[];
  tags: FunctionTag[];
  errors: Array<{ path: string; message: string }>;
}

const FUNCTION_RE = /^data\/([^/]+)\/([^/]+)\/(.+)\.mcfunction$/;
const TAG_RE = /^data\/([^/]+)\/(tags\/[^/]+)\/(.+)\.json$/;

export function parseDatapack(
  files: Record<string, string>,
  version: VersionProfile,
): ParsedDatapack {
  const functions: FunctionDef[] = [];
  const tags: FunctionTag[] = [];
  const errors: ParsedDatapack["errors"] = [];

  for (const [path, content] of Object.entries(files)) {
    const fn = FUNCTION_RE.exec(path);
    if (fn) {
      const [, namespace, folder, rest] = fn;
      if (folder !== version.functionFolder) {
        errors.push({
          path,
          message: `Function folder '${folder}' is not valid for ${version.id}; expected '${version.functionFolder}'.`,
        });
        continue;
      }
      const lines = content.split(/\r?\n/);
      const macroKeys = new Set<string>();
      let hasMacroLines = false;
      for (const line of lines) {
        if (!line.startsWith("$")) continue;
        hasMacroLines = true;
        const regex = /\$\(([^)]*)\)/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line))) {
          if (match[1]) macroKeys.add(match[1]);
        }
      }
      functions.push({
        id: `${namespace}:${rest}`,
        path,
        lines,
        macroKeys: [...macroKeys],
        hasMacroLines,
      });
      continue;
    }
    if (!path.startsWith("data/")) continue;
    const tag = TAG_RE.exec(path);
    if (!tag) continue;
    const [, namespace, folder, rest] = tag;
    if (folder !== version.tagFolder) {
      errors.push({
        path,
        message: `Tag folder '${folder}' is not valid for ${version.id}; expected '${version.tagFolder}'.`,
      });
      continue;
    }
    try {
      const parsed = JSON.parse(content) as { values?: unknown };
      if (!Array.isArray(parsed.values)) {
        errors.push({ path, message: "Function tag is missing a 'values' array." });
        continue;
      }
      tags.push({
        id: `${namespace}:${rest}`,
        values: parsed.values.filter((v): v is string => typeof v === "string"),
      });
    } catch (error) {
      errors.push({ path, message: `Invalid tag JSON: ${(error as Error).message}` });
    }
  }

  return { functions, tags, errors };
}

export function functionFiles(files: Record<string, string>, version: VersionProfile): string[] {
  return Object.keys(files).filter(
    (path) =>
      path.startsWith("data/") &&
      path.includes(`/${version.functionFolder}/`) &&
      path.endsWith(".mcfunction"),
  );
}

export function listFunctionIds(
  files: Record<string, string>,
  version: VersionProfile,
): Array<{ id: string; path: string; hasMacros: boolean }> {
  return functionFiles(files, version).map((path) => {
    const fn = FUNCTION_RE.exec(path)!;
    return {
      id: `${fn[1]}:${fn[3]}`,
      path,
      hasMacros: files[path].split(/\r?\n/).some((line) => line.startsWith("$")),
    };
  });
}

export function listFunctionTags(
  files: Record<string, string>,
  version: VersionProfile,
): Array<{ id: string; path: string; values: string[] }> {
  const out: Array<{ id: string; path: string; values: string[] }> = [];
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith("data/") || !path.includes(`/${version.tagFolder}/`) || !path.endsWith(".json")) {
      continue;
    }
    const match = TAG_RE.exec(path);
    if (!match) continue;
    try {
      const parsed = JSON.parse(content) as { values?: unknown };
      out.push({
        id: `${match[1]}:${match[3]}`,
        path,
        values: Array.isArray(parsed.values)
          ? parsed.values.filter((v): v is string => typeof v === "string")
          : [],
      });
    } catch {
      // The linter surfaces malformed JSON separately.
    }
  }
  return out;
}

export function collectStorageIds(files: Record<string, string>): string[] {
  const ids = new Set<string>();
  const regex = /\b(?:data\s+(?:get|modify|merge|remove)\s+storage|if\s+data\s+storage|with\s+storage)\s+([a-z0-9_.-]+(?::[a-z0-9_./-]+)?)/g;
  for (const content of Object.values(files)) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      const id = match[1].includes(":") ? match[1] : `minecraft:${match[1]}`;
      ids.add(id);
    }
  }
  return [...ids].sort();
}

export function collectObjectiveIds(files: Record<string, string>): string[] {
  const ids = new Set<string>();
  const regex = /scoreboard\s+objectives\s+add\s+([A-Za-z0-9_.+-]+)/g;
  for (const content of Object.values(files)) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) ids.add(match[1]);
  }
  return [...ids].sort();
}

export function collectScoreHolders(files: Record<string, string>): string[] {
  const ids = new Set<string>();
  const regex = /scoreboard\s+players\s+(?:set|add|remove|get|reset)\s+([A-Za-z0-9_.+-]+)/g;
  for (const content of Object.values(files)) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content))) {
      if (!match[1].startsWith("@")) ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

export function createStarterFiles(version: VersionProfile): Record<string, string> {
  const fn = version.functionFolder;
  const tag = version.tagFolder;
  const packMeta =
    version.packMeta === "legacy"
      ? JSON.stringify(
          { pack: { pack_format: version.packFormat[0], description: "cmdlib starter pack" } },
          null,
          2,
        )
      : JSON.stringify(
          {
            pack: {
              description: "cmdlib starter pack",
              min_format: [version.packFormat[0], version.packFormat[1]],
              max_format: [version.packFormat[0], version.packFormat[1]],
            },
          },
          null,
          2,
        );

  return {
    "pack.mcmeta": packMeta + "\n",
    [`data/cmdlib/${fn}/load.mcfunction`]: `# Runs once when the pack is loaded.
scoreboard objectives add points dummy {"text":"Bounty Points","color":"gold"}
scoreboard objectives add streak dummy {"text":"Streak","color":"aqua"}
scoreboard objectives setdisplay sidebar points
scoreboard players set @s points 0
scoreboard players set @s streak 0

data modify storage cmdlib:board quest set value {id:"wither_hunt",reward:250,active:1b}
data modify storage cmdlib:board stats set value {claims:0,total:0}

summon armor_stand 3 64 1 {CustomName:'{"text":"Bounty","color":"gold"}',Tags:["quest"],Glowing:1b,NoGravity:1b}
summon zombie -3 64 3 {CustomName:'{"text":"Target","color":"red"}',Tags:["target"],NoAI:1b}

title @s times 10 60 20
tellraw @s [{"text":"Bounty board online. ","color":"gray"},{"text":"Run /function cmdlib:demo","color":"green"}]
`,
    [`data/cmdlib/${fn}/demo.mcfunction`]: `# One command that exercises the 26.3 demo surface.
scoreboard players add @s points 50
scoreboard players add @s streak 1

title @s title {"text":"BOUNTY CLAIMED","color":"gold","bold":true}
title @s subtitle {"text":"The board pays out.","color":"gray"}

# A macro function, fed from a storage compound.
function cmdlib:reward with storage cmdlib:board quest

# Move the target by changing NBT. No AI, just data.
data modify entity @e[tag=target,limit=1] Pos set value [0.0d,64.0d,0.0d]

execute if score @s streak matches 1.. run title @s actionbar {"text":"Streak x1","color":"aqua"}
execute store result storage cmdlib:stats points int 1 run scoreboard players get @s points

data modify storage cmdlib:board last_reward set value {amount:250,holder:"@s"}
data get storage cmdlib:stats
`,
    [`data/cmdlib/${fn}/reward.mcfunction`]: `# Macro function: every $ line is interpolated at call time.
$title @s actionbar {"text":"Reward paid: $(reward) points","color":"aqua"}
$scoreboard players add @s points $(reward)
$data modify storage cmdlib:board last_reward set value {amount:$(reward),holder:"@s"}
$tellraw @s [{"text":"Macro expanded with reward=","color":"gray"},{"text":"$(reward)","color":"gold"}]
`,
    [`data/cmdlib/${fn}/storage.mcfunction`]: `# Storage is the pack's scratch disk.
data modify storage cmdlib:log entries set value []
data modify storage cmdlib:log entries append value {event:"claimed",reward:250}
data modify storage cmdlib:log entries append value {event:"streak",value:1}
data get storage cmdlib:log entries[0]
data get storage cmdlib:log entries
`,
    [`data/cmdlib/${fn}/scoreboard.mcfunction`]: `# Scoreboard arithmetic, exactly as it works in game.
scoreboard players set @s points 100
scoreboard players add @s points 50
scoreboard players operation @s points += @s streak
scoreboard players get @s points
`,
    [`data/minecraft/${tag}/load.json`]: JSON.stringify(
      { values: ["cmdlib:load"] },
      null,
      2,
    ) + "\n",
  };
}

export function createProject(versionId = "26.3", name = "Bounty Board"): Project {
  const version = getVersion(versionId);
  const files = createStarterFiles(version);
  return {
    name,
    versionId,
    files,
    activePath: `data/cmdlib/${version.functionFolder}/demo.mcfunction`,
    updatedAt: Date.now(),
  };
}

/** A small project used by the landing page live simulation. */
export function createLandingProject(versionId = "26.3"): Project {
  const version = getVersion(versionId);
  const fn = version.functionFolder;
  const tag = version.tagFolder;
  const files: Record<string, string> = {
    "pack.mcmeta": JSON.stringify(
      {
        pack: {
          description: "cmdlib landing demo",
          min_format: [version.packFormat[0], version.packFormat[1]],
          max_format: [version.packFormat[0], version.packFormat[1]],
        },
      },
      null,
      2,
    ) + "\n",
    [`data/landing/${fn}/load.mcfunction`]: `# The landing page runs this real load tag on boot.
scoreboard objectives add progress dummy {"text":"PROGRESS","color":"gold","bold":true}
scoreboard objectives setdisplay sidebar progress
scoreboard players set @s progress 0

data modify storage landing:state stage set value "boot"
data modify storage landing:state ticks set value 0

summon armor_stand 3 64 1 {CustomName:'{"text":"Beacon","color":"gold"}',Tags:["beacon"],Glowing:1b,NoGravity:1b}
summon zombie -3 64 2 {CustomName:'{"text":"Target","color":"red"}',Tags:["target"],NoAI:1b}
summon marker 0 64 -3 {CustomName:'{"text":"Anchor","color":"aqua"}',Tags:["anchor"]}

title @s times 5 55 10
tellraw @s [{"text":"world booted","color":"gray"}]
`,
    [`data/landing/${fn}/stamp.mcfunction`]: `# Macro function used by the scroll demo.
$data modify storage landing:state stage set value "$(stage)"
$tellraw @s [{"text":"macro → ","color":"gray"},{"text":"$(stage)","color":"aqua"}]
$title @s subtitle {"text":"stage: $(stage)","color":"gray"}
`,
    [`data/minecraft/${tag}/load.json`]: JSON.stringify({ values: ["landing:load"] }, null, 2) + "\n",
  };
  return {
    name: "Landing",
    versionId,
    files,
    activePath: `data/landing/${fn}/load.mcfunction`,
    updatedAt: Date.now(),
  };
}

export function projectFunctionIds(project: Project): string[] {
  return listFunctionIds(project.files, getVersion(project.versionId)).map((f) => f.id);
}

export function displayNameForFile(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

export function fileKind(path: string): "mcfunction" | "json" | "mcmeta" | "other" {
  if (path.endsWith(".mcfunction")) return "mcfunction";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith("pack.mcmeta")) return "mcmeta";
  return "other";
}

export function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function functionIdFromPath(
  path: string,
  version: VersionProfile,
): string | null {
  const match = FUNCTION_RE.exec(path);
  if (!match) return null;
  if (match[2] !== version.functionFolder) return null;
  return `${match[1]}:${match[3]}`;
}

export function namespaced(id: string): string {
  const [namespace, path] = splitId(id);
  return `${namespace}:${path}`;
}
