import { CompoundTag, NbtTag, Tag, numericValue } from "./nbt";
import {
  createEntity,
  entityCustomName,
  entityPos,
  EntityData,
} from "./entities";
import type { Vec3 } from "./entities";
import { VersionProfile, getVersion } from "./version";
import type { TextRenderContext } from "./text";
import { formatTagForComponent } from "./text";
import {
  holderName as entityHolderName,
  parseSelector,
  resolveSingleHolder,
  selectEntities,
  SelectorError,
} from "./selectors";
import { parseSnbt } from "./snbt";
import { plainText } from "./text";
import { getPathValues, parseNbtPath } from "./nbtPath";

export interface Objective {
  name: string;
  criterion: string;
  displayName: NbtTag;
  renderType: "integer" | "hearts";
}

export interface TitleTimings {
  fadeIn: number;
  stay: number;
  fadeOut: number;
}

export interface TitleState {
  title?: NbtTag;
  subtitle?: NbtTag;
  actionbar?: NbtTag;
  times: TitleTimings;
  revision: number;
  titleRevision: number;
  actionbarRevision: number;
  setAt: number;
  actionbarSetAt: number;
}

export type LogKind = "chat" | "actionbar" | "error" | "info" | "success" | "command" | "data" | "system";

export interface WorldLogEntry {
  id: number;
  kind: LogKind;
  text: string;
  component?: NbtTag;
  time: number;
}

export interface FunctionDef {
  id: string;
  path: string;
  lines: string[];
  macroKeys: string[];
  hasMacroLines: boolean;
}

export interface FunctionTag {
  id: string;
  values: string[];
  /** Source file, when loaded from a datapack. */
  path?: string;
}

export interface WorldOptions {
  version: VersionProfile;
  seedPlayer?: boolean;
  playerName?: string;
  playerPos?: Vec3;
}

let logId = 0;

export class World {
  readonly version: VersionProfile;
  tick = 0;
  entities: EntityData[] = [];
  storages = new Map<string, CompoundTag>();
  objectives = new Map<string, Objective>();
  scores = new Map<string, Map<string, number>>();
  displaySlots = new Map<string, string | null>();
  holderNames = new Map<string, string>();
  functions = new Map<string, FunctionDef>();
  functionTags = new Map<string, FunctionTag>();
  blocks = new Map<string, string>();
  logs: WorldLogEntry[] = [];
  titles: TitleState = {
    times: { fadeIn: 10, stay: 70, fadeOut: 20 },
    revision: 0,
    titleRevision: 0,
    actionbarRevision: 0,
    setAt: 0,
    actionbarSetAt: 0,
  };
  revision = 0;
  selectedEntity: string | null = null;
  private listeners = new Set<() => void>();
  private commandBudget = 0;

  constructor(options: WorldOptions) {
    this.version = options.version ?? getVersion("26.3");
    if (options.seedPlayer !== false) {
      const player = createEntity(
        "minecraft:player",
        options.playerPos ?? { x: 0, y: 64, z: 0 },
        null,
        { isPlayer: true, username: options.playerName ?? "Dev" },
      );
      this.entities.push(player);
    }
  }

  /* ------------------------------ events ------------------------------ */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  touch(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  resetCommandBudget(): void {
    this.commandBudget = 0;
  }

  consumeCommand(count = 1): void {
    this.commandBudget += count;
    if (this.commandBudget > 65536) {
      throw new Error("Command chain exceeded 65536 commands (maxCommandChainLength)");
    }
  }

  /* ---------------------------- scoreboard ---------------------------- */

  addObjective(name: string, criterion: string, displayName?: NbtTag): Objective {
    if (this.objectives.has(name)) {
      throw new Error(`An objective named '${name}' already exists`);
    }
    const objective: Objective = {
      name,
      criterion,
      displayName: displayName ?? Tag.string('{"text":""}'),
      renderType: "integer",
    };
    this.objectives.set(name, objective);
    if (!this.scores.has(name)) this.scores.set(name, new Map());
    return objective;
  }

  removeObjective(name: string): boolean {
    const existed = this.objectives.delete(name);
    this.scores.delete(name);
    for (const [slot, objective] of this.displaySlots) {
      if (objective === name) this.displaySlots.set(slot, null);
    }
    return existed;
  }

  getObjective(name: string): Objective | undefined {
    return this.objectives.get(name);
  }

  requireObjective(name: string): Objective {
    const objective = this.objectives.get(name);
    if (!objective) throw new Error(`Unknown objective '${name}'`);
    return objective;
  }

  setScore(holder: string, objective: string, value: number): void {
    this.requireObjective(objective);
    let map = this.scores.get(objective);
    if (!map) {
      map = new Map();
      this.scores.set(objective, map);
    }
    map.set(holder, Math.trunc(value));
  }

  getScore(holder: string, objective: string): number | undefined {
    return this.scores.get(objective)?.get(holder);
  }

  addScore(holder: string, objective: string, delta: number): number {
    this.requireObjective(objective);
    const next = (this.getScore(holder, objective) ?? 0) + delta;
    this.setScore(holder, objective, next);
    return next;
  }

  resetScore(holder: string, objective: string): void {
    this.scores.get(objective)?.delete(holder);
  }

  resetAllScores(holder: string): void {
    for (const map of this.scores.values()) map.delete(holder);
  }

  scoreObjectives(holder: string): string[] {
    const out: string[] = [];
    for (const [objective, map] of this.scores) {
      if (map.has(holder)) out.push(objective);
    }
    return out;
  }

  setDisplaySlot(slot: string, objective: string | null): void {
    this.displaySlots.set(slot, objective);
  }

  setHolderDisplayName(holder: string, name: string): void {
    this.holderNames.set(holder, name);
  }

  holderDisplayName(holder: string): string {
    const explicit = this.holderNames.get(holder);
    if (explicit) return explicit;
    const entity = this.entities.find((e) => entityHolderName(e) === holder);
    if (entity) return entityCustomName(entity);
    return holder;
  }

  sidebar(): { objective: Objective; entries: Array<{ holder: string; display: string; value: number }> } | null {
    const objectiveName = this.displaySlots.get("sidebar");
    if (!objectiveName) return null;
    const objective = this.objectives.get(objectiveName);
    if (!objective) return null;
    const map = this.scores.get(objectiveName) ?? new Map();
    const entries = [...map.entries()]
      .map(([holder, value]) => ({
        holder,
        display: this.holderDisplayName(holder),
        value,
      }))
      .sort((a, b) => b.value - a.value || a.holder.localeCompare(b.holder))
      .slice(0, 15);
    return { objective, entries };
  }

  /* ------------------------------- titles ----------------------------- */

  setTitle(kind: "title" | "subtitle" | "actionbar", component: NbtTag): void {
    if (kind === "title") this.titles.title = component;
    else if (kind === "subtitle") this.titles.subtitle = component;
    else {
      this.titles.actionbar = component;
      this.titles.actionbarSetAt = Date.now();
      this.titles.actionbarRevision++;
      this.titles.revision++;
      return;
    }
    this.titles.titleRevision++;
    this.titles.setAt = Date.now();
    this.titles.revision++;
  }

  clearTitle(kind: "title" | "subtitle" | "actionbar" | "all"): void {
    if (kind === "title" || kind === "all") {
      this.titles.title = undefined;
      this.titles.titleRevision++;
    }
    if (kind === "subtitle" || kind === "all") {
      this.titles.subtitle = undefined;
      this.titles.titleRevision++;
    }
    if (kind === "actionbar" || kind === "all") {
      this.titles.actionbar = undefined;
      this.titles.actionbarRevision++;
    }
    this.titles.revision++;
  }

  setTitleTimes(fadeIn: number, stay: number, fadeOut: number): void {
    this.titles.times = { fadeIn, stay, fadeOut };
    this.titles.titleRevision++;
    this.titles.revision++;
  }

  /* ------------------------------ entities ---------------------------- */

  addEntity(entity: EntityData): void {
    this.entities.push(entity);
  }

  removeEntity(entity: EntityData): void {
    const index = this.entities.indexOf(entity);
    if (index >= 0) this.entities.splice(index, 1);
    if (this.selectedEntity === entity.uuid) this.selectedEntity = null;
  }

  player(): EntityData | undefined {
    return this.entities.find((e) => e.isPlayer);
  }

  entityByUuid(uuid: string): EntityData | undefined {
    return this.entities.find((e) => e.uuid === uuid);
  }

  /* ------------------------------- data ------------------------------- */

  storage(id: string, create = false): CompoundTag | undefined {
    const existing = this.storages.get(id);
    if (existing) return existing;
    if (!create) return undefined;
    const compound = Tag.compound();
    this.storages.set(id, compound);
    return compound;
  }

  getBlockNbt(pos: Vec3): CompoundTag {
    const key = `${pos.x},${pos.y},${pos.z}`;
    const id = this.blocks.get(key);
    if (!id) return Tag.compound();
    return Tag.compound({ id: Tag.string(id) });
  }

  setBlock(pos: Vec3, id: string): void {
    this.blocks.set(`${pos.x},${pos.y},${pos.z}`, id);
  }

  getBlock(pos: Vec3): string | undefined {
    return this.blocks.get(`${pos.x},${pos.y},${pos.z}`);
  }

  /* ------------------------------ functions --------------------------- */

  setFunctions(functions: FunctionDef[]): void {
    this.functions.clear();
    for (const fn of functions) this.functions.set(fn.id, fn);
  }

  setFunctionTags(tags: FunctionTag[]): void {
    this.functionTags.clear();
    for (const tag of tags) this.functionTags.set(tag.id, tag);
  }

  getFunction(id: string): FunctionDef | undefined {
    return this.functions.get(id);
  }

  getFunctionTag(id: string): FunctionTag | undefined {
    return this.functionTags.get(id);
  }

  /* -------------------------------- logs ------------------------------ */

  log(kind: LogKind, text: string, component?: NbtTag): void {
    this.logs.push({
      id: ++logId,
      kind,
      text,
      component,
      time: Date.now(),
    });
    if (this.logs.length > 600) this.logs.splice(0, this.logs.length - 600);
  }

  chat(component: NbtTag, fallback: string): void {
    const text = this.plain(component) || fallback;
    this.logs.push({
      id: ++logId,
      kind: "chat",
      text,
      component,
      time: Date.now(),
    });
    if (this.logs.length > 600) this.logs.splice(0, this.logs.length - 600);
  }

  /* ------------------------------- text ------------------------------- */

  plain(component: NbtTag): string {
    return plainComponentText(this, component);
  }

  textContext(source: EntityData | null, origin?: Vec3): TextRenderContext {
    const pos = origin ?? (source ? entityPos(source) : { x: 0, y: 64, z: 0 });
    return {
      resolveScoreHolder: (name) => {
        if (name === "@s" && source) return entityHolderName(source);
        try {
          return resolveSingleHolder(this, name, source, pos);
        } catch {
          return name;
        }
      },
      resolveScore: (holder, objective) => this.getScore(holder, objective) ?? null,
      resolveSelector: (selector) => {
        try {
          const parsed = parseSelector(selector);
          return selectEntities(this, parsed, {
            source,
            origin: pos,
            lenient: true,
          }).map(entityCustomName);
        } catch {
          return [];
        }
      },
      resolveEntityNbt: (sourceType, path) => {
        try {
          const parts = path.split(/\s+/);
          if (sourceType === "storage" && parts.length >= 1) {
            const storage = this.storages.get(parts[0]);
            if (!storage) return null;
            const path = parts.slice(1).join(" ");
            const values = getPathValues(storage, parseNbtPath(path));
            return values.map(formatTagForComponent).join(", ");
          }
          return null;
        } catch {
          return null;
        }
      },
    };
  }

  /* ------------------------------- misc ------------------------------- */

  cloneScoresFrom(other: World): void {
    for (const [name, objective] of other.objectives) {
      this.objectives.set(name, { ...objective, displayName: objective.displayName });
      this.scores.set(name, new Map(other.scores.get(name) ?? []));
    }
    for (const [slot, objective] of other.displaySlots) {
      this.displaySlots.set(slot, objective);
    }
    for (const [holder, name] of other.holderNames) {
      this.holderNames.set(holder, name);
    }
  }

  describeVersion(): string {
    return this.version.id;
  }
}

function plainComponentText(world: World, component: NbtTag): string {
  return plainText(component, world.textContext(null));
}

export function makeWorld(versionId: string, playerPos?: Vec3): World {
  return new World({ version: getVersion(versionId), playerPos });
}

export function readNumber(tag: NbtTag | undefined, fallback = 0): number {
  return numericValue(tag) ?? fallback;
}

export { entityPos, parseSnbt, SelectorError };
