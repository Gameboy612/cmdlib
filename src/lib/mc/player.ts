import { cloneTag, CompoundTag, stringifySnbt } from "./nbt";

/**
 * Player and entity runtime state that is simulated but not rendered.
 *
 * The world owns one `PlayerState` per score-holder key (a player's username,
 * or an entity UUID). Keeping this separate from the entity NBT means commands
 * like `/give` and `/effect` stay deterministic and can be inspected by the UI
 * without inventing fake vanilla NBT layouts.
 */

export type GameMode = "survival" | "creative" | "adventure" | "spectator";

export const GAME_MODES: readonly GameMode[] = [
  "survival",
  "creative",
  "adventure",
  "spectator",
];

export function isGameMode(value: string): value is GameMode {
  return (GAME_MODES as readonly string[]).includes(value);
}

/** One stack in a simulated player inventory. */
export interface InventoryItem {
  /** Normalised resource location, e.g. `minecraft:diamond`. */
  id: string;
  count: number;
  /** Optional SNBT payload, used to keep differently-tagged stacks apart. */
  nbt?: CompoundTag;
}

/** One active status effect. Durations are counted down by `Simulator.tick()`. */
export interface StatusEffect {
  /** Normalised resource location, e.g. `minecraft:speed`. */
  id: string;
  amplifier: number;
  /** Remaining duration in game ticks. */
  durationTicks: number;
  /** True when the effect was applied with `hideParticles`. */
  hidden: boolean;
}

export interface PlayerState {
  gameMode: GameMode;
  inventory: InventoryItem[];
  /** Objective names this holder may currently `/trigger`. */
  enabledTriggers: Set<string>;
  /** Entity UUID currently being spectated, if any. */
  spectating?: string;
}

export function createPlayerState(gameMode: GameMode = "survival"): PlayerState {
  return {
    gameMode,
    inventory: [],
    enabledTriggers: new Set(),
  };
}

export function cloneInventoryItem(item: InventoryItem): InventoryItem {
  return {
    id: item.id,
    count: item.count,
    ...(item.nbt ? { nbt: cloneTag(item.nbt) as CompoundTag } : {}),
  };
}

export function cloneStatusEffect(effect: StatusEffect): StatusEffect {
  return { ...effect };
}

/**
 * Stable key for "same item stack" merging. NBT is compared structurally by
 * its typed SNBT representation, so `{a:1b}` and `{a:1}` are different stacks
 * exactly as they are in game.
 */
export function itemNbtKey(nbt?: CompoundTag): string {
  return nbt ? stringifySnbt(nbt, { typed: true, quoteKeys: true }) : "";
}
