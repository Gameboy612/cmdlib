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
import {
  cloneStatusEffect,
  createPlayerState,
  GameMode,
  InventoryItem,
  itemComponentKey,
  itemNbtKey,
  PlayerState,
  StatusEffect,
} from "./player";
import type { PredicateDefinition } from "./predicates";
import {
  HOTBAR_SIZE,
  MAIN_INVENTORY_SIZE,
  normalizeItemId,
  resolveSlot,
} from "./items";
import type { AdvancementDefinition } from "./advancements";
import type { ItemModifierDefinition } from "./item_modifiers";

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

export type LogKind = "chat" | "actionbar" | "error" | "warning" | "info" | "success" | "command" | "data" | "system";

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

/**
 * One `/schedule function` entry. A function id may have more than one entry
 * when it was queued with `append`; `sequence` keeps that queue stable when
 * two entries share a due tick.
 */
/** Minecraft scoreboards store Java 32-bit signed integers. */
export const SCOREBOARD_MIN = -2147483648;
export const SCOREBOARD_MAX = 2147483647;

export function clampScore(value: number): number {
  const whole = Math.trunc(value);
  if (Number.isNaN(whole)) return 0;
  if (whole > SCOREBOARD_MAX) return SCOREBOARD_MAX;
  if (whole < SCOREBOARD_MIN) return SCOREBOARD_MIN;
  return whole;
}

export interface ScheduledFunction {
  /** Function resource location, e.g. `cmdlib:tick`. */
  functionId: string;
  /** World tick at which the command was run. */
  scheduledAtTick: number;
  /** Absolute world tick on which the function becomes due. */
  dueTick: number;
  /** Monotonic insertion order, used to break due-tick ties. */
  sequence: number;
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
  /** Tick rate in ticks per second (Minecraft's /tick rate). */
  tickRate = 20;
  /** When true, the timeline's automatic tick loop is frozen. */
  tickFrozen = false;
  entities: EntityData[] = [];
  /**
   * Simulated player state, keyed by score-holder name (username for players).
   * The map is public for inspection; commands mutate through the helpers in
   * the "player runtime" section below.
   */
  playerStates = new Map<string, PlayerState>();
  /** Active status effects, keyed by the same holder key. */
  statusEffects = new Map<string, StatusEffect[]>();
  storages = new Map<string, CompoundTag>();
  objectives = new Map<string, Objective>();
  scores = new Map<string, Map<string, number>>();
  displaySlots = new Map<string, string | null>();
  holderNames = new Map<string, string>();
  functions = new Map<string, FunctionDef>();
  functionTags = new Map<string, FunctionTag>();
  /** Datapack predicates, keyed by resource location. */
  predicates = new Map<string, PredicateDefinition>();
  /** Datapack advancements, keyed by resource location. */
  advancements = new Map<string, AdvancementDefinition>();
  /** Datapack item modifiers, keyed by resource location. */
  itemModifiers = new Map<string, ItemModifierDefinition>();
  /** Completed advancements per score holder (player username). */
  advancementProgress = new Map<string, Set<string>>();
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
  private scheduleQueue: ScheduledFunction[] = [];
  private scheduleSequence = 0;

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
    map.set(holder, clampScore(value));
  }

  getScore(holder: string, objective: string): number | undefined {
    return this.scores.get(objective)?.get(holder);
  }

  addScore(holder: string, objective: string, delta: number): number {
    this.requireObjective(objective);
    const next = clampScore((this.getScore(holder, objective) ?? 0) + delta);
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

  /* --------------------------- player runtime ------------------------- */

  /**
   * Resolve a target to its runtime state key. Players use their username so
   * state survives an entity object being replaced (teleport, re-summon, …);
   * other entities fall back to their UUID.
   */
  runtimeKey(target?: EntityData | string | null): string {
    if (typeof target === "string") return target;
    if (target) return entityHolderName(target);
    const player = this.player();
    return player ? entityHolderName(player) : "Dev";
  }

  /** Read-only player state, or undefined when the holder has never acted. */
  playerState(target?: EntityData | string | null): PlayerState | undefined {
    return this.playerStates.get(this.runtimeKey(target));
  }

  playerGameMode(target?: EntityData | string | null): GameMode {
    return this.playerState(target)?.gameMode ?? "survival";
  }

  /** Read-only inventory view for the UI. Do not mutate the returned array. */
  playerInventory(target?: EntityData | string | null): readonly InventoryItem[] {
    return this.playerState(target)?.inventory ?? [];
  }

  /** Read-only status effects for a player or any entity holder. */
  effectsOf(target?: EntityData | string | null): readonly StatusEffect[] {
    return this.statusEffects.get(this.runtimeKey(target)) ?? [];
  }

  isTriggerEnabled(
    target: EntityData | string | null,
    objective: string,
  ): boolean {
    return this.playerState(target)?.enabledTriggers.has(objective) ?? false;
  }

  spectatorTarget(target?: EntityData | string | null): string | undefined {
    return this.playerState(target)?.spectating;
  }

  setSpectatorTarget(
    target: EntityData | string | null,
    entityUuid: string | null,
  ): void {
    const state = this.ensurePlayerState(target);
    if (entityUuid) state.spectating = entityUuid;
    else delete state.spectating;
  }

  private ensurePlayerState(target?: EntityData | string | null): PlayerState {
    const key = this.runtimeKey(target);
    let state = this.playerStates.get(key);
    if (!state) {
      state = createPlayerState();
      this.playerStates.set(key, state);
    }
    return state;
  }

  setPlayerGameMode(
    target: EntityData | string | null,
    mode: GameMode,
  ): void {
    this.ensurePlayerState(target).gameMode = mode;
  }

  /**
   * Add items to a holder's inventory, merging stacks with the same id and NBT
   * payload. Returns the affected stack.
   */
  givePlayerItem(
    target: EntityData | string | null,
    id: string,
    count: number,
    nbt?: CompoundTag,
    components?: Record<string, NbtTag>,
  ): InventoryItem {
    const state = this.ensurePlayerState(target);
    const normalized = normalizeItemId(id);
    const key = itemNbtKey(nbt);
    const componentKey = itemComponentKey(components);
    const existing = state.inventory.find(
      (item) =>
        item.id === normalized &&
        itemNbtKey(item.nbt) === key &&
        itemComponentKey(item.components) === componentKey,
    );
    if (existing) {
      existing.count += count;
      return existing;
    }
    const used = new Set(state.inventory.map((item) => item.slot).filter(Boolean));
    let slot: string | undefined;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (!used.has(`hotbar.${i}`)) {
        slot = `hotbar.${i}`;
        break;
      }
    }
    if (!slot) {
      for (let i = 0; i < MAIN_INVENTORY_SIZE; i++) {
        if (!used.has(`inventory.${i}`)) {
          slot = `inventory.${i}`;
          break;
        }
      }
    }
    const item: InventoryItem = {
      id: normalized,
      count,
      ...(nbt ? { nbt: JSON.parse(JSON.stringify(nbt)) as CompoundTag } : {}),
      ...(components ? { components: JSON.parse(JSON.stringify(components)) } : {}),
      ...(slot ? { slot } : {}),
    };
    state.inventory.push(item);
    return item;
  }

  getItemAt(target: EntityData | string | null, slot: string): InventoryItem | undefined {
    const state = this.playerState(target);
    if (!state) return undefined;
    const resolved = resolveSlot(slot, state.selectedSlot);
    if (!resolved) return undefined;
    const collection = resolved.storage === "enderchest" ? state.enderchest : state.inventory;
    const exact = collection.find((item) => item.slot === resolved.key);
    if (exact) return exact;
    if (resolved.key === `hotbar.${state.selectedSlot}`) {
      return collection.find((item) => !item.slot) ?? collection[0];
    }
    return undefined;
  }

  setItemAt(
    target: EntityData | string | null,
    slot: string,
    item: InventoryItem | null,
  ): boolean {
    if (!target) return false;
    const state = this.ensurePlayerState(target);
    const resolved = resolveSlot(slot, state.selectedSlot);
    if (!resolved) return false;
    const collection = resolved.storage === "enderchest" ? state.enderchest : state.inventory;
    const index = collection.findIndex((entry) => entry.slot === resolved.key);
    if (index >= 0) collection.splice(index, 1);
    if (item) {
      collection.push({ ...item, slot: resolved.key });
    }
    this.touch();
    return true;
  }

  playerHealth(target: EntityData | string | null = null): number {
    const entity = typeof target === "string"
      ? this.entities.find((entry) => entry.username === target || entry.uuid === target)
      : target ?? this.player();
    const health = entity?.nbt.value.Health;
    return typeof health?.value === "number" ? Math.max(0, health.value) : 20;
  }

  damagePlayer(target: EntityData | string | null, amount: number): number {
    const entity = typeof target === "string"
      ? this.entities.find((entry) => entry.username === target || entry.uuid === target)
      : target ?? this.player();
    if (!entity || amount <= 0) return this.playerHealth(entity ?? null);
    const next = Math.max(0, this.playerHealth(entity) - amount);
    entity.nbt.value.Health = Tag.float(next);
    this.touch();
    return next;
  }

  enderchestItems(target: EntityData | string | null): readonly InventoryItem[] {
    return this.playerState(target)?.enderchest ?? [];
  }

  /**
   * Remove matching items from a holder's inventory.
   *
   * With no `id`, the whole inventory is cleared. With `id` and no `maxCount`,
   * every matching stack is removed. `maxCount` limits how many items are
   * removed, stopping part-way through a stack. Returns the removed count.
   */
  clearPlayerItems(
    target: EntityData | string | null,
    id?: string,
    nbt?: CompoundTag,
    maxCount?: number,
  ): number {
    const state = this.playerState(target);
    if (!state || state.inventory.length === 0) return 0;
    if (id === undefined) {
      const removed = state.inventory.reduce((sum, item) => sum + item.count, 0);
      state.inventory.length = 0;
      return removed;
    }
    const nbtKey = nbt === undefined ? undefined : itemNbtKey(nbt);
    let budget = maxCount === undefined ? Infinity : Math.max(0, Math.trunc(maxCount));
    let removed = 0;
    const remaining: InventoryItem[] = [];
    for (const item of state.inventory) {
      const matches =
        item.id === id &&
        (nbtKey === undefined || itemNbtKey(item.nbt) === nbtKey);
      if (!matches || budget <= 0) {
        remaining.push(item);
        continue;
      }
      const take = Math.min(item.count, budget);
      removed += take;
      budget -= take;
      if (take < item.count) remaining.push({ ...item, count: item.count - take });
    }
    state.inventory.length = 0;
    state.inventory.push(...remaining);
    return removed;
  }

  /** Apply (or refresh) one effect on a holder, replacing the same effect id. */
  applyStatusEffect(
    target: EntityData | string | null,
    effect: StatusEffect,
  ): void {
    const key = this.runtimeKey(target);
    let list = this.statusEffects.get(key);
    if (!list) {
      list = [];
      this.statusEffects.set(key, list);
    }
    const index = list.findIndex((entry) => entry.id === effect.id);
    if (index >= 0) list[index] = cloneStatusEffect(effect);
    else list.push(cloneStatusEffect(effect));
  }

  /** Remove one effect id, or every effect when `id` is omitted. */
  clearStatusEffects(
    target: EntityData | string | null,
    id?: string,
  ): number {
    const key = this.runtimeKey(target);
    const list = this.statusEffects.get(key);
    if (!list) return 0;
    if (id === undefined) {
      const removed = list.length;
      this.statusEffects.delete(key);
      return removed;
    }
    const remaining = list.filter((effect) => effect.id !== id);
    const removed = list.length - remaining.length;
    if (remaining.length > 0) this.statusEffects.set(key, remaining);
    else this.statusEffects.delete(key);
    return removed;
  }

  /**
   * Advance every effect by one tick, dropping effects whose duration reaches
   * zero. Returns the number of effects that expired.
   */
  tickStatusEffects(): number {
    let expired = 0;
    for (const [key, list] of [...this.statusEffects]) {
      const remaining: StatusEffect[] = [];
      for (const effect of list) {
        effect.durationTicks -= 1;
        if (effect.durationTicks > 0) remaining.push(effect);
        else expired += 1;
      }
      if (remaining.length > 0) this.statusEffects.set(key, remaining);
      else this.statusEffects.delete(key);
    }
    return expired;
  }

  setTriggerEnabled(
    target: EntityData | string | null,
    objective: string,
    enabled = true,
  ): void {
    const state = this.ensurePlayerState(target);
    if (enabled) state.enabledTriggers.add(objective);
    else state.enabledTriggers.delete(objective);
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

  /* ----------------------------- predicates --------------------------- */

  setPredicates(
    predicates:
      | Iterable<PredicateDefinition>
      | Map<string, PredicateDefinition>,
  ): void {
    this.predicates.clear();
    const values =
      predicates instanceof Map ? predicates.values() : predicates;
    for (const definition of values) {
      this.predicates.set(normalizePredicateId(definition.id), definition);
    }
  }

  getPredicate(id: string): PredicateDefinition | undefined {
    return this.predicates.get(normalizePredicateId(id));
  }

  predicateIds(): string[] {
    return [...this.predicates.keys()];
  }

  /* ----------------------------- advancements ------------------------- */

  setAdvancements(
    advancements:
      | Iterable<AdvancementDefinition>
      | Map<string, AdvancementDefinition>,
  ): void {
    this.advancements.clear();
    const values =
      advancements instanceof Map ? advancements.values() : advancements;
    for (const definition of values) {
      this.advancements.set(definition.id, definition);
    }
  }

  getAdvancement(id: string): AdvancementDefinition | undefined {
    return this.advancements.get(id);
  }

  isAdvancementGranted(holder: string, id: string): boolean {
    return this.advancementProgress.get(holder)?.has(id) ?? false;
  }

  grantAdvancement(holder: string, id: string): boolean {
    if (!this.advancements.has(id)) return false;
    let completed = this.advancementProgress.get(holder);
    if (!completed) {
      completed = new Set();
      this.advancementProgress.set(holder, completed);
    }
    if (completed.has(id)) return false;
    completed.add(id);
    this.touch();
    return true;
  }

  revokeAdvancement(holder: string, id: string): boolean {
    const completed = this.advancementProgress.get(holder);
    if (!completed?.delete(id)) return false;
    this.touch();
    return true;
  }

  advancementProgressFor(holder: string): ReadonlySet<string> {
    return this.advancementProgress.get(holder) ?? new Set();
  }

  setItemModifiers(modifiers: Iterable<ItemModifierDefinition> | Map<string, ItemModifierDefinition>): void {
    this.itemModifiers.clear();
    const values = modifiers instanceof Map ? modifiers.values() : modifiers;
    for (const modifier of values) this.itemModifiers.set(modifier.id, modifier);
  }

  getItemModifier(id: string): ItemModifierDefinition | undefined {
    return this.itemModifiers.get(id);
  }

  /* ------------------------------ schedule ---------------------------- */

  /**
   * Current `/schedule function` queue, ordered by due tick then sequence.
   * Read-only: mutate through `scheduleFunction` / `clearSchedules` so the
   * sequence counter and ordering stay consistent.
   */
  get scheduled(): readonly ScheduledFunction[] {
    return this.scheduleQueue;
  }

  /**
   * Queue a function. `replace` (the default) drops any existing entries for
   * the same function first; `append` keeps them and adds another entry.
   */
  scheduleFunction(
    functionId: string,
    delayTicks: number,
    mode: "replace" | "append" = "replace",
  ): ScheduledFunction {
    if (mode === "replace") this.clearSchedules(functionId);
    // The command parser only accepts integers, but keep the state honest if
    // another caller passes a fractional or negative delay.
    const delay = Math.max(0, Math.trunc(delayTicks));
    const entry: ScheduledFunction = {
      functionId,
      scheduledAtTick: this.tick,
      dueTick: this.tick + delay,
      sequence: ++this.scheduleSequence,
    };
    this.scheduleQueue.push(entry);
    this.scheduleQueue.sort(
      (a, b) => a.dueTick - b.dueTick || a.sequence - b.sequence,
    );
    return entry;
  }

  /** Remove every entry for `functionId`, or the whole queue when omitted. */
  clearSchedules(functionId?: string): number {
    if (functionId === undefined) {
      const removed = this.scheduleQueue.length;
      this.scheduleQueue = [];
      return removed;
    }
    const before = this.scheduleQueue.length;
    this.scheduleQueue = this.scheduleQueue.filter(
      (entry) => entry.functionId !== functionId,
    );
    return before - this.scheduleQueue.length;
  }

  /**
   * Atomically take every entry due at or before `currentTick`. The tick
   * runtime calls this once per tick, so functions queued by the tick tag are
   * handled by the same pass while functions queued by a due function wait for
   * the next tick.
   */
  collectDueSchedules(currentTick: number = this.tick): ScheduledFunction[] {
    if (this.scheduleQueue.length === 0) return [];
    const due: ScheduledFunction[] = [];
    const remaining: ScheduledFunction[] = [];
    for (const entry of this.scheduleQueue) {
      if (entry.dueTick <= currentTick) due.push(entry);
      else remaining.push(entry);
    }
    if (due.length === 0) return [];
    this.scheduleQueue = remaining;
    return due;
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

function normalizePredicateId(id: string): string {
  return id.includes(":") ? id : `minecraft:${id}`;
}

export { entityPos, parseSnbt, SelectorError };
