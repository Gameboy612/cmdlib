"use client";

import { create } from "zustand";
import {
  createDefaultKeybindings,
  KEYBINDING_ACTIONS,
  normalizeBinding,
  type BindingAction,
  type Keybindings,
} from "../keybindings";

export const PREFERENCES_STORAGE_KEY = "cmdlib:preferences:v1";

const ACTION_IDS = new Set<string>(KEYBINDING_ACTIONS.map((action) => action.id));

export interface PreferencesState {
  keybindings: Keybindings;
  hydrated: boolean;
  hydrate: () => void;
  setBinding: (action: BindingAction, value: string) => void;
  resetKeybindings: () => void;
}

function isBindingAction(value: string): value is BindingAction {
  return ACTION_IDS.has(value);
}

function readStoredKeybindings(): Keybindings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const container = parsed as Record<string, unknown>;
    const nested = container.keybindings;
    const source =
      nested && typeof nested === "object" && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : container;

    const bindings = createDefaultKeybindings();
    for (const action of KEYBINDING_ACTIONS) {
      const value = source[action.id];
      if (typeof value !== "string") continue;
      if (value === "") {
        bindings[action.id] = "";
        continue;
      }
      const normalized = normalizeBinding(value);
      if (normalized) bindings[action.id] = normalized;
    }
    return bindings;
  } catch {
    return null;
  }
}

function persistKeybindings(keybindings: Keybindings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ keybindings }),
    );
  } catch {
    // Private mode or a full quota should never break the editor.
  }
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  keybindings: createDefaultKeybindings(),
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = readStoredKeybindings();
    set({ keybindings: stored ?? createDefaultKeybindings(), hydrated: true });
  },

  setBinding: (action, value) => {
    if (!isBindingAction(action)) return;
    const keybindings: Keybindings = {
      ...get().keybindings,
      [action]: normalizeBinding(value),
    };
    persistKeybindings(keybindings);
    set({ keybindings, hydrated: true });
  },

  resetKeybindings: () => {
    const keybindings = createDefaultKeybindings();
    persistKeybindings(keybindings);
    set({ keybindings, hydrated: true });
  },
}));
