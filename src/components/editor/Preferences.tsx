"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  bindingParts,
  detectPlatform,
  eventToBinding,
  findBindingConflicts,
  formatBinding,
  isDefaultKeybindings,
  KEYBINDING_ACTIONS,
  type BindingAction,
  type Platform,
} from "@/lib/keybindings";
import { usePreferences } from "@/lib/state/preferences";
import styles from "./preferences.module.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const ACTION_LABELS = new Map<BindingAction, string>(
  KEYBINDING_ACTIONS.map((action) => [action.id, action.label]),
);

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
}

function trapTab(event: KeyboardEvent, root: HTMLElement | null): void {
  if (event.key !== "Tab") return;
  const elements = getFocusable(root);
  if (elements.length === 0) {
    event.preventDefault();
    return;
  }
  const first = elements[0];
  const last = elements[elements.length - 1];
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root?.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export interface PreferencesProps {
  open: boolean;
  onClose: () => void;
}

export function Preferences({ open, onClose }: PreferencesProps) {
  const keybindings = usePreferences((state) => state.keybindings);
  const hydrate = usePreferences((state) => state.hydrate);
  const setBinding = usePreferences((state) => state.setBinding);
  const resetKeybindings = usePreferences((state) => state.resetKeybindings);

  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("pc");
  const [recording, setRecording] = useState<BindingAction | null>(null);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Mount flag keeps the portal out of the server render (and avoids a
  // platform-dependent hydration mismatch for "Mod" labels).
  useEffect(() => {
    setPlatform(detectPlatform());
    setMounted(true);
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!open) return;
    setRecording(null);
    hydrate();
    const previous = document.activeElement;
    restoreRef.current = previous instanceof HTMLElement ? previous : null;
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      const target = restoreRef.current;
      restoreRef.current = null;
      if (target?.isConnected) target.focus();
    };
  }, [open, hydrate]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (recording) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setRecording(null);
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          setBinding(recording, "");
          setRecording(null);
          return;
        }
        if (event.key === "Tab") {
          setRecording(null);
          trapTab(event, panelRef.current);
          return;
        }
        const next = eventToBinding(event, platform);
        if (!next) return; // Bare modifiers and unmappable keys keep listening.
        event.preventDefault();
        event.stopPropagation();
        setBinding(recording, next);
        setRecording(null);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      trapTab(event, panelRef.current);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, recording, onClose, setBinding, platform]);

  const conflicts = useMemo(
    () => findBindingConflicts(keybindings, platform),
    [keybindings, platform],
  );
  const defaults = useMemo(() => isDefaultKeybindings(keybindings), [keybindings]);

  if (!mounted || !open) return null;

  const close = () => {
    setRecording(null);
    onClose();
  };

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              Preferences
            </h2>
            <p className={styles.subtitle}>Keyboard shortcuts · saved in this browser</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={close}
            aria-label="Close preferences"
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.description}>
            Click a shortcut, then press the keys you want. Backspace clears it; Escape cancels.
          </p>
          <div className={styles.columns} aria-hidden="true">
            <span>Action</span>
            <span>Shortcut</span>
          </div>
          <ul className={styles.list} aria-label="Keyboard shortcuts">
            {KEYBINDING_ACTIONS.map((action) => {
              const value = keybindings[action.id];
              const isRecording = recording === action.id;
              const keys = value ? bindingParts(value, platform) : [];
              const shortcut = value ? formatBinding(value, platform) : "Unassigned";
              const conflict = conflicts[action.id] ?? [];
              return (
                <li key={action.id} className={styles.row}>
                  <div className={styles.rowLabel}>
                    <span className={styles.actionLabel}>{action.label}</span>
                    <span className={styles.actionHint}>
                      {isRecording ? "Listening for a shortcut…" : action.description}
                    </span>
                    {conflict.length > 0 && (
                      <span className={styles.conflict}>
                        Also used by{" "}
                        {conflict.map((id) => ACTION_LABELS.get(id) ?? id).join(", ")}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`${styles.binding} ${isRecording ? styles.bindingRecording : ""} ${
                      !value && !isRecording ? styles.bindingEmpty : ""
                    }`}
                    onClick={() => setRecording((current) => (current === action.id ? null : action.id))}
                    aria-pressed={isRecording}
                    aria-label={
                      isRecording
                        ? `Recording shortcut for ${action.label}. Press Escape to cancel.`
                        : `${action.label}: ${shortcut}. Activate to record a new shortcut.`
                    }
                    title={isRecording ? "Press Escape to cancel" : "Click to record a shortcut"}
                  >
                    {isRecording ? (
                      <span className={styles.recording}>
                        <span className={styles.recordDot} aria-hidden="true" />
                        Press keys…
                      </span>
                    ) : keys.length > 0 ? (
                      keys.map((part, index) => (
                        <kbd key={`${part}-${index}`} className={styles.key}>
                          {part}
                        </kbd>
                      ))
                    ) : (
                      <span className={styles.unassigned}>Unassigned</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={styles.srOnly} role="status" aria-live="polite">
            {recording ? `Recording shortcut for ${ACTION_LABELS.get(recording) ?? recording}.` : ""}
          </div>
        </div>

        <footer className={styles.footer}>
          <span className={styles.footerHint}>
            {recording
              ? "Esc cancels · Backspace clears · click outside closes"
              : "Click a shortcut to record · Esc closes"}
          </span>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.reset}
              onClick={() => {
                setRecording(null);
                resetKeybindings();
              }}
              disabled={defaults}
            >
              Reset defaults
            </button>
            <button type="button" className={styles.done} onClick={close}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
