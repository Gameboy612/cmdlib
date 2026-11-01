import type { Project } from "../datapack";
import { getVersion } from "../version";

/**
 * Test-only fixture. The old Bounty Board demo lived in the editor's starter
 * pack; it is kept here so the runtime and linter tests stay on the same
 * realistic multi-function pack without shipping example code to users.
 */
export function createDemoProject(versionId = "26.3"): Project {
  const version = getVersion(versionId);
  const fn = version.functionFolder;
  const tag = version.tagFolder;
  const ns = "cmdlib";
  const packMeta =
    version.packMeta === "legacy"
      ? JSON.stringify(
          { pack: { pack_format: version.packFormat[0], description: "Bounty Board" } },
          null,
          2,
        )
      : JSON.stringify(
          {
            pack: {
              description: "Bounty Board",
              min_format: [version.packFormat[0], version.packFormat[1]],
              max_format: [version.packFormat[0], version.packFormat[1]],
            },
          },
          null,
          2,
        );

  return {
    id: "pack-bounty-board",
    name: "Bounty Board",
    versionId: version.id,
    activePath: `data/${ns}/${fn}/demo.mcfunction`,
    updatedAt: Date.now(),
    files: {
      "pack.mcmeta": packMeta + "\n",
      [`data/${ns}/${fn}/load.mcfunction`]: `# Runs once when the pack is loaded.
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
      [`data/${ns}/${fn}/demo.mcfunction`]: `# One command that exercises the 26.3 demo surface.
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
      [`data/${ns}/${fn}/reward.mcfunction`]: `# Macro function: every $ line is interpolated at call time.
$title @s actionbar {"text":"Reward paid: $(reward) points","color":"aqua"}
$scoreboard players add @s points $(reward)
$data modify storage cmdlib:board last_reward set value {amount:$(reward),holder:"@s"}
$tellraw @s [{"text":"Macro expanded with reward=","color":"gray"},{"text":"$(reward)","color":"gold"}]
`,
      [`data/${ns}/${fn}/storage.mcfunction`]: `# Storage is the pack's scratch disk.
data modify storage cmdlib:log entries set value []
data modify storage cmdlib:log entries append value {event:"claimed",reward:250}
data modify storage cmdlib:log entries append value {event:"streak",value:1}
data get storage cmdlib:log entries[0]
data get storage cmdlib:log entries
`,
      [`data/${ns}/${fn}/scoreboard.mcfunction`]: `# Scoreboard arithmetic, exactly as it works in game.
scoreboard players set @s points 100
scoreboard players add @s points 50
scoreboard players operation @s points += @s streak
scoreboard players get @s points
`,
      [`data/minecraft/${tag}/load.json`]: JSON.stringify({ values: ["cmdlib:load"] }, null, 2) + "\n",
    },
  };
}
