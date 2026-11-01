import { executeHandler } from "./execute";
import { functionHandler } from "./function";
import { dataHandler } from "./data";
import { scoreboardHandler } from "./scoreboard";
import { titleHandler } from "./title";
import { scheduleHandler } from "./schedule";
import {
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
};

export { executeHandler, scoreboardHandler, titleHandler, functionHandler, dataHandler };
export { scheduleHandler, parseScheduleTime, TICKS_PER_SECOND, TICKS_PER_DAY, SCHEDULE_USAGE } from "./schedule";
