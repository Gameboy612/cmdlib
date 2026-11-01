import { CompoundTag, isCompound, isList, NbtTag, stringifySnbt, Tag } from "./nbt";
import { parseTextComponent } from "./snbt";
import { plainText } from "./text";
import { entityInfo } from "./data";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  yaw: number;
  pitch: number;
}

export interface EntityData {
  uuid: string;
  type: string;
  nbt: CompoundTag;
  isPlayer: boolean;
  username?: string;
}

let uuidCounter = 0;

export function nextUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  uuidCounter++;
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
}

export function normalizeType(type: string): string {
  return type.includes(":") ? type : `minecraft:${type}`;
}

export function createEntity(
  type: string,
  pos: Vec3,
  overrides: CompoundTag | null = null,
  opts: { isPlayer?: boolean; username?: string } = {},
): EntityData {
  const fullType = normalizeType(type);
  const info = entityInfo(fullType);
  const base: Record<string, NbtTag> = {};
  const defaults = info.defaults ?? {
    Health: Tag.float(20),
    Tags: Tag.list([], "string"),
  };
  for (const [key, value] of Object.entries(defaults)) {
    base[key] = clone(value);
  }
  base.Pos = Tag.list([Tag.double(pos.x), Tag.double(pos.y), Tag.double(pos.z)], "double");
  if (opts.isPlayer) {
    base.Rotation = Tag.list([Tag.float(0), Tag.float(0)], "float");
    if (!base.Health) base.Health = Tag.float(20);
    if (!base.foodLevel) base.foodLevel = Tag.int(20);
  }
  // NBT supplied by a command (including Pos) is applied after the defaults.
  if (overrides) {
    for (const [key, value] of Object.entries(overrides.value)) {
      base[key] = clone(value);
    }
  }
  const uuid = nextUuid();
  if (!base.UUID) base.UUID = Tag.intArray(uuidToInts(uuid));
  const entity: EntityData = {
    uuid,
    type: fullType,
    nbt: Tag.compound(base),
    isPlayer: opts.isPlayer ?? false,
    username: opts.username,
  };
  if (entity.isPlayer && entity.username) {
    entity.nbt.value.CustomName = Tag.string(
      `{"text":${JSON.stringify(entity.username)}}`,
    );
  }
  return entity;
}

function clone(tag: NbtTag): NbtTag {
  return JSON.parse(JSON.stringify(tag)) as NbtTag;
}

function uuidToInts(uuid: string): number[] {
  const hex = uuid.replace(/-/g, "").padEnd(32, "0");
  const ints: number[] = [];
  for (let i = 0; i < 32; i += 8) {
    ints.push(parseInt(hex.slice(i, i + 8), 16) | 0);
  }
  return ints;
}

export function readVec3(tag: NbtTag | undefined, fallback: Vec3): Vec3 {
  if (!tag || !isList(tag) || tag.value.length < 3) return { ...fallback };
  const nums = tag.value.slice(0, 3).map((t) => (t.type === "string" ? 0 : t.value));
  return {
    x: Number(nums[0]) || 0,
    y: Number(nums[1]) || 0,
    z: Number(nums[2]) || 0,
  };
}

export function entityPos(entity: EntityData): Vec3 {
  return readVec3(entity.nbt.value.Pos, { x: 0, y: 64, z: 0 });
}

export function setEntityPos(entity: EntityData, pos: Vec3): void {
  entity.nbt.value.Pos = Tag.list(
    [Tag.double(pos.x), Tag.double(pos.y), Tag.double(pos.z)],
    "double",
  );
}

export function entityRotation(entity: EntityData): Vec2 {
  const rotation = entity.nbt.value.Rotation;
  if (rotation && isList(rotation) && rotation.value.length >= 2) {
    const yaw = rotation.value[0].value as number;
    const pitch = rotation.value[1].value as number;
    return { yaw: Number(yaw) || 0, pitch: Number(pitch) || 0 };
  }
  return { yaw: 0, pitch: 0 };
}

export function setEntityRotation(entity: EntityData, rotation: Vec2): void {
  entity.nbt.value.Rotation = Tag.list(
    [Tag.float(rotation.yaw), Tag.float(rotation.pitch)],
    "float",
  );
}

export function entityTags(entity: EntityData): string[] {
  const tags = entity.nbt.value.Tags;
  if (!isList(tags)) return [];
  return tags.value
    .filter((t) => t.type === "string")
    .map((t) => (t as { value: string }).value);
}

export function entityCustomName(entity: EntityData): string {
  if (entity.isPlayer && entity.username) return entity.username;
  const custom = entity.nbt.value.CustomName;
  if (!custom) return entityInfo(entity.type).name;
  try {
    if (custom.type === "string") {
      const raw = custom.value.trim();
      if (raw.length === 0) return entityInfo(entity.type).name;
      if (raw.startsWith("{") || raw.startsWith('"') || raw.startsWith("[")) {
        const rendered = plainText(parseTextComponent(raw));
        return rendered.length > 0 ? rendered : entityInfo(entity.type).name;
      }
      return raw;
    }
    const rendered = plainText(custom);
    return rendered.length > 0 ? rendered : entityInfo(entity.type).name;
  } catch {
    return entityInfo(entity.type).name;
  }
}

export function entityHealth(entity: EntityData): number {
  const health = entity.nbt.value.Health;
  return health && typeof health.value === "number" ? health.value : 20;
}

export function describeEntity(entity: EntityData): string {
  const pos = entityPos(entity);
  return `${entityCustomName(entity)} (${entity.type.replace("minecraft:", "")}) @ ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
}

export function entityNbtPreview(entity: EntityData, maxLength = 160): string {
  const text = stringifySnbt(entity.nbt, { typed: false, quoteKeys: true });
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

export function isMarker(entity: EntityData): boolean {
  return entity.type === "minecraft:marker";
}

export function findNbtKey(compound: NbtTag, key: string): NbtTag | undefined {
  return isCompound(compound) ? compound.value[key] : undefined;
}
