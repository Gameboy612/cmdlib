import { Cursor } from "../cursor";
import {
  CompoundTag,
  isCompound,
  isList,
  isString,
  NbtTag,
  Tag,
} from "../nbt";
import { ENTITY_BY_ID, entityInfo } from "../data";
import {
  createEntity,
  entityCustomName,
  entityPos,
  entityRotation,
  normalizeType,
  setEntityPos,
  setEntityRotation,
  type EntityData,
} from "../entities";
import { resolveEntityTargets, SelectorError } from "../selectors";
import { CommandContext, CommandResult, executeCommandLine, feedback, print, ReturnSignal } from "./context";
import { CommandError } from "../cursor";

type Handler = (cursor: Cursor, ctx: CommandContext) => CommandResult;

export const summonHandler: Handler = (cursor, ctx) => {
  const typeStart = cursor.mark();
  const rawType = cursor.readWord();
  const type = normalizeType(rawType);
  const info = ENTITY_BY_ID.get(type.replace("minecraft:", ""));
  if (!info && !ctx.lint) {
    cursor.error(
      `Unknown entity type '${rawType}'. Try zombie, armor_stand, item or marker.`,
      typeStart,
      "entity-type",
    );
  }
  let pos = ctx.pos;
  let nbt: CompoundTag | null = null;
  if (!cursor.done() && cursor.peek() !== "{") {
    pos = cursor.readVec3(ctx.pos, ctx.rotation);
  }
  if (!cursor.done()) {
    const parsed = cursor.readSnbt();
    if (!isCompound(parsed.tag)) {
      cursor.error("Entity NBT must be a compound", parsed.start, "nbt-type");
    }
    nbt = parsed.tag as CompoundTag;
  }
  if (ctx.lint) return { result: 1, success: true };
  const entity = createEntity(type, pos, nbt, { isPlayer: false });
  ctx.world.addEntity(entity);
  feedback(ctx, "success", `Summoned new ${info?.name ?? type}`);
  return { result: 1, success: true };
};

export const killHandler: Handler = (cursor, ctx) => {
  let raw = "@s";
  if (!cursor.done()) raw = cursor.readTargetsRaw().raw;
  let entities: EntityData[];
  try {
    entities = resolveEntityTargets(ctx.world, raw, {
      source: ctx.source,
      origin: ctx.pos,
      lenient: ctx.lint,
    });
  } catch (error) {
    if (error instanceof SelectorError) cursor.error(error.message, cursor.mark(), "selector");
    throw error;
  }
  if (ctx.lint) return { result: entities.length, success: true };
  for (const entity of entities) {
    if (entity.isPlayer) {
      entity.nbt.value.Health = Tag.float(0);
    } else {
      ctx.world.removeEntity(entity);
    }
  }
  feedback(
    ctx,
    "success",
    entities.length === 1
      ? `Killed ${entityCustomName(entities[0])}`
      : `Killed ${entities.length} entities`,
  );
  return { result: entities.length, success: true };
};

export const teleportHandler: Handler = (cursor, ctx) => {
  const targetsStart = cursor.mark();
  const raw = cursor.readTargetsRaw().raw;
  let entities: EntityData[];
  try {
    entities = resolveEntityTargets(ctx.world, raw, {
      source: ctx.source,
      origin: ctx.pos,
      lenient: ctx.lint,
    });
  } catch (error) {
    if (error instanceof SelectorError) cursor.error(error.message, targetsStart, "selector");
    throw error;
  }

  let pos = ctx.pos;
  let rotation = ctx.rotation;
  const next = cursor.peekWord();
  const looksLikeCoordinate = /^[~^+\-.\d]/.test(next);
  if (looksLikeCoordinate) {
    pos = cursor.readVec3(ctx.pos, ctx.rotation);
    if (!cursor.done()) rotation = cursor.readVec2();
  } else {
    const destinationStart = cursor.mark();
    const destinationRaw = cursor.readTargetsRaw().raw;
    let destination: EntityData[];
    try {
      destination = resolveEntityTargets(ctx.world, destinationRaw, {
        source: ctx.source,
        origin: ctx.pos,
        lenient: ctx.lint,
      });
    } catch (error) {
      if (error instanceof SelectorError) cursor.error(error.message, destinationStart, "selector");
      throw error;
    }
    if (destination[0]) {
      pos = entityPos(destination[0]);
      rotation = entityRotation(destination[0]);
    }
  }

  if (!ctx.lint) {
    for (const entity of entities) {
      setEntityPos(entity, pos);
      setEntityRotation(entity, rotation);
    }
  }
  feedback(
    ctx,
    "success",
    entities.length === 1
      ? `Teleported ${entityCustomName(entities[0])} to ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}`
      : `Teleported ${entities.length} entities`,
  );
  return { result: entities.length, success: true };
};

export const tagHandler: Handler = (cursor, ctx) => {
  const targetsStart = cursor.mark();
  const raw = cursor.readTargetsRaw().raw;
  let entities: EntityData[];
  try {
    entities = resolveEntityTargets(ctx.world, raw, {
      source: ctx.source,
      origin: ctx.pos,
      lenient: ctx.lint,
    });
  } catch (error) {
    if (error instanceof SelectorError) cursor.error(error.message, targetsStart, "selector");
    throw error;
  }
  const action = cursor.readWord();
  if (!["add", "remove", "list"].includes(action)) {
    cursor.error(`Expected add, remove or list, got '${action}'`, cursor.mark() - action.length);
  }
  if (action === "list") {
    for (const entity of entities) {
      const tags = tagsOf(entity);
      print(
        ctx,
        "info",
        tags.length === 0
          ? `${entityCustomName(entity)} has no tags`
          : `${entityCustomName(entity)} has ${tags.length} tag(s): ${tags.join(", ")}`,
      );
    }
    return { result: entities.length, success: true };
  }
  const nameStart = cursor.mark();
  const name = cursor.readWord();
  if (name.length === 0) cursor.error("Expected a tag name", nameStart);
  if (!ctx.lint) {
    for (const entity of entities) {
      const tags = tagsOf(entity);
      if (action === "add" && !tags.includes(name)) tags.push(name);
      if (action === "remove") {
        const index = tags.indexOf(name);
        if (index >= 0) tags.splice(index, 1);
      }
      entity.nbt.value.Tags = Tag.list(tags.map((t) => Tag.string(t)), "string");
    }
  }
  feedback(
    ctx,
    "success",
    action === "add"
      ? `Added tag '${name}' to ${entities.length} entities`
      : `Removed tag '${name}' from ${entities.length} entities`,
  );
  return { result: entities.length, success: true };
};

export const sayHandler: Handler = (cursor, ctx) => {
  const message = cursor.readRest();
  if (message.length === 0) cursor.error("Expected a message", cursor.mark());
  const name = ctx.source ? entityCustomName(ctx.source) : "Server";
  const component = Tag.list([
    Tag.compound({ text: Tag.string("["), color: Tag.string("gray") }),
    Tag.compound({ text: Tag.string(name), color: Tag.string("gray") }),
    Tag.compound({ text: Tag.string("] "), color: Tag.string("gray") }),
    Tag.compound({ text: Tag.string(message) }),
  ]);
  if (!ctx.lint) ctx.world.chat(component, `[${name}] ${message}`);
  return { result: 1, success: true };
};

export const meHandler: Handler = (cursor, ctx) => {
  const message = cursor.readRest();
  const name = ctx.source ? entityCustomName(ctx.source) : "Server";
  const component = Tag.list([
    Tag.compound({ text: Tag.string("* "), color: Tag.string("gray") }),
    Tag.compound({ text: Tag.string(name), color: Tag.string("gray") }),
    Tag.compound({ text: Tag.string(` ${message}`), italic: Tag.byte(1) }),
  ]);
  if (!ctx.lint) ctx.world.chat(component, `* ${name} ${message}`);
  return { result: 1, success: true };
};

export const tellrawHandler: Handler = (cursor, ctx) => {
  const targetsStart = cursor.mark();
  const raw = cursor.readTargetsRaw().raw;
  const component = cursor.readComponent();
  if (ctx.lint) return { result: 1, success: true };
  let entities: EntityData[] = [];
  try {
    entities = resolveEntityTargets(ctx.world, raw, {
      source: ctx.source,
      origin: ctx.pos,
      lenient: true,
    });
  } catch {
    entities = [];
  }
  const text = ctx.world.plain(component.tag);
  ctx.world.chat(component.tag, text);
  if (entities.length === 0) {
    ctx.world.log("info", `(tellraw to no players) ${text}`);
  }
  void targetsStart;
  return { result: entities.length, success: true };
};

export const returnHandler: Handler = (cursor, ctx) => {
  if (cursor.done()) {
    cursor.error("Expected a value, 'run <command>', or 'fail'", cursor.mark(), "return");
  }
  const next = cursor.peekWord();
  if (next === "run") {
    cursor.readWord();
    const rest = cursor.readRest();
    const result = executeCommandLine(rest, ctx);
    throw new ReturnSignal(result.result);
  }
  if (next === "fail") {
    cursor.readWord();
    throw new ReturnSignal(0);
  }
  const value = cursor.readInt();
  throw new ReturnSignal(value.value);
};

export const setblockHandler: Handler = (cursor, ctx) => {
  const pos = cursor.readVec3(ctx.pos, ctx.rotation);
  const blockStart = cursor.mark();
  const block = cursor.readWord();
  if (!/^[a-z0-9_.-]+(:[a-z0-9_./-]+)?$/.test(block)) {
    cursor.error(`Invalid block id '${block}'`, blockStart, "block-id");
  }
  if (!cursor.done()) {
    const mode = cursor.readWord();
    if (!["replace", "destroy", "keep"].includes(mode)) {
      cursor.error(`Expected replace, destroy or keep, got '${mode}'`, cursor.mark() - mode.length);
    }
  }
  if (!ctx.lint) ctx.world.setBlock(pos, normalizeType(block));
  feedback(ctx, "success", `Set block at ${pos.x} ${pos.y} ${pos.z} to ${normalizeType(block)}`);
  return { result: 1, success: true };
};

export const reloadHandler: Handler = (cursor, ctx) => {
  if (!cursor.done()) cursor.error("Unexpected arguments", cursor.mark());
  feedback(ctx, "success", "Reloaded datapack functions. Run F5 to reset the world and re-run load tags.");
  return { result: 1, success: true };
};

function tagsOf(entity: EntityData): string[] {
  const tags = entity.nbt.value.Tags;
  if (!isList(tags)) return [];
  return tags.value
    .filter((tag) => isString(tag))
    .map((tag) => (tag as { value: string }).value);
}

void isCompound;
void entityInfo;
void CommandError;
