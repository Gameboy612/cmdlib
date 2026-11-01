/**
 * Keyboard shortcut serialization, formatting and matching.
 *
 * A binding is a `+`-separated list of modifier tokens followed by exactly one
 * key token, e.g. `Mod+Enter`, `Ctrl+Shift+K`, `F5`, `Mod+,`.
 *
 * `Mod` is the platform primary modifier: Ctrl on Windows/Linux, Command on
 * macOS. Serialized bindings keep the portable `Mod` token so a preferences
 * file written on one OS still works on another.
 */

export type BindingAction = "reload" | "runActive" | "palette" | "preferences" | "save";

export type Keybindings = Record<BindingAction, string>;

export type Platform = "mac" | "pc";

export type ModifierName = "mod" | "ctrl" | "meta" | "alt" | "shift";

export interface ParsedBinding {
  /** Canonical key token: letters lowercased, named keys in TitleCase. */
  key: string;
  mods: Record<ModifierName, boolean>;
}

export interface KeybindingActionDefinition {
  id: BindingAction;
  label: string;
  description: string;
}

export const KEYBINDING_ACTIONS: readonly KeybindingActionDefinition[] = [
  { id: "reload", label: "Reload pack", description: "Re-run load tags and reset the simulated world" },
  { id: "runActive", label: "Run active function", description: "Execute the function open in the editor" },
  { id: "palette", label: "Command palette", description: "Search every command, panel and file" },
  { id: "preferences", label: "Preferences", description: "Open the keyboard shortcut editor" },
  { id: "save", label: "Save", description: "Persist the pack to this browser" },
];

export const DEFAULT_KEYBINDINGS: Readonly<Keybindings> = Object.freeze({
  reload: "F5",
  runActive: "Mod+Enter",
  palette: "Mod+K",
  preferences: "Mod+,",
  save: "Mod+S",
});

const MODIFIER_ORDER: readonly ModifierName[] = ["mod", "ctrl", "meta", "alt", "shift"];

const MODIFIER_TOKENS: Record<ModifierName, string> = {
  mod: "Mod",
  ctrl: "Ctrl",
  meta: "Meta",
  alt: "Alt",
  shift: "Shift",
};

const MODIFIER_ALIASES: Record<string, ModifierName> = {
  mod: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  super: "meta",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
};

const KEY_ALIASES: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  tab: "Tab",
  " ": "Space",
  space: "Space",
  spacebar: "Space",
  up: "ArrowUp",
  arrowup: "ArrowUp",
  down: "ArrowDown",
  arrowdown: "ArrowDown",
  left: "ArrowLeft",
  arrowleft: "ArrowLeft",
  right: "ArrowRight",
  arrowright: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  insert: "Insert",
  plus: "+",
  minus: "-",
  equal: "=",
  comma: ",",
  period: ".",
  slash: "/",
  backslash: "\\",
  semicolon: ";",
  quote: "'",
  backquote: "`",
  bracketleft: "[",
  bracketright: "]",
};

/** Modifier-only keys can never be the final key of a binding. */
const NON_BINDABLE_KEYS = new Set([
  "",
  "control",
  "shift",
  "alt",
  "meta",
  "os",
  "super",
  "hyper",
  "fn",
  "altgraph",
  "capslock",
  "numlock",
  "scrolllock",
  "fnlock",
  "dead",
  "process",
  "unidentified",
]);

const MAC_MODIFIER_LABELS: Record<ModifierName, string> = {
  mod: "⌘",
  ctrl: "⌃",
  meta: "⌘",
  alt: "⌥",
  shift: "⇧",
};

const PC_MODIFIER_LABELS: Record<ModifierName, string> = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  meta: "Meta",
  alt: "Alt",
  shift: "Shift",
};

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "pc";
  const agent = navigator as Navigator & { userAgentData?: { platform?: string } };
  const value = agent.userAgentData?.platform || agent.platform || agent.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(value) ? "mac" : "pc";
}

export function isMacPlatform(): boolean {
  return detectPlatform() === "mac";
}

/** Turn a raw `KeyboardEvent.key` into the canonical key token used in bindings. */
export function normalizeKey(key: string): string | null {
  if (!key) return null;
  const lowered = key.toLowerCase();
  if (NON_BINDABLE_KEYS.has(lowered)) return null;
  const alias = KEY_ALIASES[lowered];
  if (alias) return alias;
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(lowered)) return lowered.toUpperCase();
  if (key.length === 1) return lowered;
  return null;
}

function serializeKey(key: string): string {
  // "+" is the binding separator, so it is always stored under its name.
  if (key === "+") return "Plus";
  return key.length === 1 && /[a-z]/.test(key) ? key.toUpperCase() : key;
}

export function parseBinding(binding: string): ParsedBinding | null {
  if (typeof binding !== "string") return null;
  const trimmed = binding.trim();
  if (!trimmed) return null;
  const segments = trimmed
    .split("+")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  const keyToken = segments[segments.length - 1] ?? "";
  const modifierTokens = segments.slice(0, -1);
  const mods: Record<ModifierName, boolean> = {
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
  };
  for (const token of modifierTokens) {
    const modifier = MODIFIER_ALIASES[token.toLowerCase()];
    if (!modifier) return null;
    mods[modifier] = true;
  }

  const key = normalizeKey(keyToken);
  if (!key) return null;

  return { key, mods };
}

export function serializeBinding(binding: ParsedBinding): string {
  const tokens: string[] = [];
  for (const name of MODIFIER_ORDER) {
    if (binding.mods[name]) tokens.push(MODIFIER_TOKENS[name]);
  }
  tokens.push(serializeKey(binding.key));
  return tokens.join("+");
}

/** Canonical form of a binding, or `""` when the input is not a valid shortcut. */
export function normalizeBinding(binding: string): string {
  const parsed = parseBinding(binding);
  return parsed ? serializeBinding(parsed) : "";
}

function labelParts(binding: ParsedBinding, platform: Platform): string[] {
  const labels = platform === "mac" ? MAC_MODIFIER_LABELS : PC_MODIFIER_LABELS;
  const parts: string[] = [];
  for (const name of MODIFIER_ORDER) {
    if (!binding.mods[name]) continue;
    const label = labels[name];
    // Ctrl and Mod collapse to the same label on Windows/Linux.
    if (!parts.includes(label)) parts.push(label);
  }
  parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);
  return parts;
}

/**
 * Human readable pieces of a shortcut, suitable for rendering one `<kbd>` per
 * entry. Returns `[]` for an empty binding.
 */
export function bindingParts(binding: string, platform: Platform = detectPlatform()): string[] {
  if (!binding.trim()) return [];
  const parsed = parseBinding(binding);
  if (!parsed) return [binding.trim()];
  return labelParts(parsed, platform);
}

export function formatBinding(binding: string, platform: Platform = detectPlatform()): string {
  const parts = bindingParts(binding, platform);
  return parts.length > 0 ? parts.join("+") : "Unassigned";
}

export function matchesBinding(
  event: KeyboardEvent,
  binding: string,
  platform: Platform = detectPlatform(),
): boolean {
  const parsed = parseBinding(binding);
  if (!parsed) return false;
  const key = normalizeKey(event.key);
  if (!key || key !== parsed.key) return false;

  const mac = platform === "mac";
  const expectsCtrl = parsed.mods.ctrl || (parsed.mods.mod && !mac);
  const expectsMeta = parsed.mods.meta || (parsed.mods.mod && mac);

  return (
    event.ctrlKey === expectsCtrl &&
    event.metaKey === expectsMeta &&
    event.altKey === parsed.mods.alt &&
    event.shiftKey === parsed.mods.shift
  );
}

/** Serialize a keydown into a canonical binding, or `null` for bare modifiers. */
export function eventToBinding(
  event: KeyboardEvent,
  platform: Platform = detectPlatform(),
): string | null {
  const key = normalizeKey(event.key);
  if (!key) return null;

  const mac = platform === "mac";
  const mods: Record<ModifierName, boolean> = {
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
  };

  const primary = mac ? event.metaKey : event.ctrlKey;
  const secondary = mac ? event.ctrlKey : event.metaKey;
  if (primary && !secondary) {
    mods.mod = true;
  } else {
    if (event.ctrlKey) mods.ctrl = true;
    if (event.metaKey) mods.meta = true;
  }
  mods.alt = event.altKey;
  mods.shift = event.shiftKey;

  return serializeBinding({ key, mods });
}

export function createDefaultKeybindings(): Keybindings {
  return { ...DEFAULT_KEYBINDINGS };
}

export function isDefaultKeybindings(bindings: Keybindings): boolean {
  return KEYBINDING_ACTIONS.every(
    (action) =>
      normalizeBinding(bindings[action.id]) === normalizeBinding(DEFAULT_KEYBINDINGS[action.id]),
  );
}

/**
 * Actions sharing a shortcut, keyed by the action that has a conflict. Values
 * are the other actions using the same combination. Platform aware: `Mod+K`
 * and `Ctrl+K` conflict on Windows/Linux.
 */
export function findBindingConflicts(
  bindings: Keybindings,
  platform: Platform = detectPlatform(),
): Partial<Record<BindingAction, BindingAction[]>> {
  const groups = new Map<string, BindingAction[]>();
  for (const action of KEYBINDING_ACTIONS) {
    const value = bindings[action.id];
    if (!value || !normalizeBinding(value)) continue;
    const label = formatBinding(value, platform);
    const group = groups.get(label);
    if (group) group.push(action.id);
    else groups.set(label, [action.id]);
  }

  const conflicts: Partial<Record<BindingAction, BindingAction[]>> = {};
  for (const actions of groups.values()) {
    if (actions.length < 2) continue;
    for (const action of actions) {
      conflicts[action] = actions.filter((other) => other !== action);
    }
  }
  return conflicts;
}
