import { executeHandler } from "./execute";
import { functionHandler } from "./function";
import { dataHandler } from "./data";
import { scoreboardHandler } from "./scoreboard";
import { titleHandler } from "./title";
import { scheduleHandler } from "./schedule";
import {
  clearHandler,
  effectHandler,
  gamemodeHandler,
  giveHandler,
  spectateHandler,
  triggerHandler,
} from "./player";
import {
  forceloadHandler,
  killHandler,
  meHandler,
  reloadHandler,
  returnHandler,
  sayHandler,
  setblockHandler,
  summonHandler,
  tagHandler,
  teleportHandler,
  tellrawHandler,
} from "./core";
import type { CommandContext, CommandResult } from "./context";
import type { Cursor } from "../cursor";

export type CommandHandler = (cursor: Cursor, ctx: CommandContext) => CommandResult;

export const HANDLERS: Record<string, CommandHandler> = {
  execute: executeHandler,
  scoreboard: scoreboardHandler,
  title: titleHandler,
  function: functionHandler,
  forceload: forceloadHandler,
  data: dataHandler,
  summon: summonHandler,
  kill: killHandler,
  teleport: teleportHandler,
  tp: teleportHandler,
  tag: tagHandler,
  say: sayHandler,
  tellraw: tellrawHandler,
  me: meHandler,
  return: returnHandler,
  setblock: setblockHandler,
  reload: reloadHandler,
  schedule: scheduleHandler,
  gamemode: gamemodeHandler,
  give: giveHandler,
  spectate: spectateHandler,
  clear: clearHandler,
  effect: effectHandler,
  trigger: triggerHandler,
};

export { executeHandler, scoreboardHandler, titleHandler, functionHandler, dataHandler };
export { gamemodeHandler, giveHandler, clearHandler, effectHandler, triggerHandler };
export { scheduleHandler, parseScheduleTime, TICKS_PER_SECOND, TICKS_PER_DAY, SCHEDULE_USAGE } from "./schedule";
