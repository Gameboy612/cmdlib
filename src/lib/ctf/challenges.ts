export interface CtfChallenge {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  repoUrl: string;
  /** Files the player is allowed to inspect. */
  publicFiles: Record<string, string>;
  /** Server-side files loaded into the simulator; never shown in the UI. */
  serverFiles: Record<string, string>;
  /** Expected flag, read from .secret/flag.txt when available. */
  flag: string;
}

export const CTF_CHALLENGES: CtfChallenge[] = [
  {
    id: "cuhkctf26-lab1",
    title: "CUHKCTF26 Workshop Lab 1",
    description:
      "Reverse engineer the sqrt machine and recover the flag. You only get the public datapack and player commands.",
    category: "Reverse Engineering",
    difficulty: "1 / 5",
    repoUrl: "https://github.com/Gameboy612/CUHKCTF26-Workshop-CMDLab1",
    flag: "test{fake_flag}",
    publicFiles: {
  "README.md": "All files under this folder could be inspected.",
  "CUHKCTF26-Workshop-Lab1/pack.mcmeta": "{\n  \"pack\": {\n    \"description\": \"CUHKCTF26-Workshop-Lab1\",\n    \"min_format\": [\n      121,\n      0\n    ],\n    \"max_format\": [\n      121,\n      0\n    ]\n  }\n}",
  "CUHKCTF26-Workshop-Lab1/data/secret/function/print_flag.mcfunction": "# This file is kept secret from the player, it will not be sent as part of the challenge\n\ntellraw @s [{\"text\": \"Congratulations! Here is your flag: \", \"color\": \"gold\"}, {\"text\": \"test{fake_flag}\", \"color\": \"aqua\"}]\n\n",
  "CUHKCTF26-Workshop-Lab1/data/cmdlib/function/tick.mcfunction": "# Runs once every game tick.\n\nscoreboard players enable @a input\nexecute as @a unless score @s input matches 0 run scoreboard players operation #input sqrt = @s input\nexecute as @a unless score @s input matches 0 run function cmdlib:sqrt/calc\nexecute as @a unless score @s input matches 0 run scoreboard players set @s input 0\n",
  "CUHKCTF26-Workshop-Lab1/data/cmdlib/function/load.mcfunction": "\nscoreboard objectives add input trigger\n\n# Runs once when the pack is loaded.\nscoreboard objectives add sqrt dummy\nscoreboard players set #2 sqrt 2\nscoreboard players set #10 sqrt 10\nscoreboard players set #100 sqrt 100",
  "CUHKCTF26-Workshop-Lab1/data/cmdlib/function/sqrt/calc.mcfunction": "\n# 0 <= #input <= 214748\n# $scoreboard players set #input sqrt $(val)\nscoreboard players operation #input sqrt *= #100 sqrt\nscoreboard players operation #input sqrt *= #100 sqrt\nscoreboard players set #xn sqrt 1\nscoreboard players set #loop sqrt 20\nfunction cmdlib:sqrt/loop\n\n# Flag here!\nexecute if score #xn sqrt matches -6300 run function secret:print_flag\n\nscoreboard players operation #xint sqrt = #xn sqrt\nscoreboard players operation #xdec1 sqrt = #xn sqrt\nscoreboard players operation #xdec2 sqrt = #xn sqrt\nscoreboard players operation #xint sqrt /= #100 sqrt\nscoreboard players operation #xdec1 sqrt %= #100 sqrt\nscoreboard players operation #xdec1 sqrt /= #10 sqrt\nscoreboard players operation #xdec2 sqrt %= #100 sqrt\nscoreboard players operation #xdec2 sqrt %= #10 sqrt\ntellraw @s [{\"text\":\"sqrt: \"},{\"score\":{\"objective\":\"sqrt\",\"name\":\"#xint\"}},{\"text\": \".\"},{\"score\":{\"objective\":\"sqrt\",\"name\":\"#xdec1\"}},{\"score\":{\"objective\":\"sqrt\",\"name\":\"#xdec2\"}}]\n\n\n# INPUT: scoreboard players set #input sqrt <x>\n",
  "CUHKCTF26-Workshop-Lab1/data/cmdlib/function/sqrt/loop.mcfunction": "\nscoreboard players operation #a sqrt = #xn sqrt\nscoreboard players operation #a sqrt /= #2 sqrt\nscoreboard players operation #b sqrt = #input sqrt\nscoreboard players operation #b sqrt /= #xn sqrt\nscoreboard players operation #b sqrt /= #2 sqrt\nscoreboard players operation #xn sqrt -= #a sqrt\nscoreboard players operation #xn sqrt += #b sqrt\n\nscoreboard players remove #loop sqrt 1\nexecute if score #loop sqrt matches 1.. run function cmdlib:sqrt/loop",
  "CUHKCTF26-Workshop-Lab1/data/minecraft/tags/function/load.json": "{\n  \"values\": [\n    \"cmdlib:load\"\n  ]\n}\n",
  "CUHKCTF26-Workshop-Lab1/data/minecraft/tags/function/tick.json": "{\n  \"values\": [\n    \"cmdlib:tick\"\n  ]\n}\n"
},
    serverFiles: {
  "pack.mcmeta": "{\n  \"pack\": {\n    \"description\": \"CUHKCTF26-Workshop-Lab1\",\n    \"min_format\": [\n      121,\n      0\n    ],\n    \"max_format\": [\n      121,\n      0\n    ]\n  }\n}",
  "data/secret/function/print_flag.mcfunction": "# This file is kept secret from the player, it will not be sent as part of the challenge\n\ntellraw @s [{\"text\": \"Congratulations! Here is your flag: \", \"color\": \"gold\"}, {\"text\": \"test{fake_flag}\", \"color\": \"aqua\"}]\n\n",
  "data/cmdlib/function/tick.mcfunction": "# Runs once every game tick.\n\nscoreboard players enable @a input\nexecute as @a unless score @s input matches 0 run scoreboard players operation #input sqrt = @s input\nexecute as @a unless score @s input matches 0 run function cmdlib:sqrt/calc\nexecute as @a unless score @s input matches 0 run scoreboard players set @s input 0\n",
  "data/cmdlib/function/load.mcfunction": "\nscoreboard objectives add input trigger\n\n# Runs once when the pack is loaded.\nscoreboard objectives add sqrt dummy\nscoreboard players set #2 sqrt 2\nscoreboard players set #10 sqrt 10\nscoreboard players set #100 sqrt 100",
  "data/cmdlib/function/sqrt/calc.mcfunction": "\n# 0 <= #input <= 214748\n# $scoreboard players set #input sqrt $(val)\nscoreboard players operation #input sqrt *= #100 sqrt\nscoreboard players operation #input sqrt *= #100 sqrt\nscoreboard players set #xn sqrt 1\nscoreboard players set #loop sqrt 20\nfunction cmdlib:sqrt/loop\n\n# Flag here!\nexecute if score #xn sqrt matches -6300 run function secret:print_flag\n\nscoreboard players operation #xint sqrt = #xn sqrt\nscoreboard players operation #xdec1 sqrt = #xn sqrt\nscoreboard players operation #xdec2 sqrt = #xn sqrt\nscoreboard players operation #xint sqrt /= #100 sqrt\nscoreboard players operation #xdec1 sqrt %= #100 sqrt\nscoreboard players operation #xdec1 sqrt /= #10 sqrt\nscoreboard players operation #xdec2 sqrt %= #100 sqrt\nscoreboard players operation #xdec2 sqrt %= #10 sqrt\ntellraw @s [{\"text\":\"sqrt: \"},{\"score\":{\"objective\":\"sqrt\",\"name\":\"#xint\"}},{\"text\": \".\"},{\"score\":{\"objective\":\"sqrt\",\"name\":\"#xdec1\"}},{\"score\":{\"objective\":\"sqrt\",\"name\":\"#xdec2\"}}]\n\n\n# INPUT: scoreboard players set #input sqrt <x>\n",
  "data/cmdlib/function/sqrt/loop.mcfunction": "\nscoreboard players operation #a sqrt = #xn sqrt\nscoreboard players operation #a sqrt /= #2 sqrt\nscoreboard players operation #b sqrt = #input sqrt\nscoreboard players operation #b sqrt /= #xn sqrt\nscoreboard players operation #b sqrt /= #2 sqrt\nscoreboard players operation #xn sqrt -= #a sqrt\nscoreboard players operation #xn sqrt += #b sqrt\n\nscoreboard players remove #loop sqrt 1\nexecute if score #loop sqrt matches 1.. run function cmdlib:sqrt/loop",
  "data/minecraft/tags/function/load.json": "{\n  \"values\": [\n    \"cmdlib:load\"\n  ]\n}\n",
  "data/minecraft/tags/function/tick.json": "{\n  \"values\": [\n    \"cmdlib:tick\"\n  ]\n}\n"
},
  },
];

export function getCtfChallenge(id: string): CtfChallenge | undefined {
  return CTF_CHALLENGES.find((challenge) => challenge.id === id);
}

export const DEFAULT_CTF_CHALLENGE = CTF_CHALLENGES[0];
