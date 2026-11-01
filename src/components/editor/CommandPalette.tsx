"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { PANEL_LABELS, PANEL_ORDER } from "./panel-meta";
import { VERSIONS } from "@/lib/mc/version";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";

interface Action {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useWorkbench((state) => state.paletteOpen);
  const setOpen = useWorkbench((state) => state.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const actions = useMemo<Action[]>(() => {
    const state = useWorkbench.getState();
    const base: Action[] = [
      { id: "run-load", label: "Run load tags", hint: "F5", group: "Runtime", keywords: "reload reset boot", run: state.runLoad },
      { id: "run-demo", label: "Run the demo function", group: "Runtime", keywords: "demo example", run: state.runDemo },
      { id: "run-file", label: "Run the active function", hint: "⌘↵", group: "Runtime", keywords: "execute", run: state.runActive },
      { id: "export", label: "Export pack as .zip", group: "Pack", keywords: "download save", run: state.exportZip },
      { id: "new-project", label: "Start a new pack", group: "Pack", keywords: "reset create", run: state.newProject },
      { id: "reset-layout", label: "Reset dock layout", group: "Layout", keywords: "panels windows", run: state.resetLayout },
      { id: "re-lint", label: "Re-run the linter", group: "Tools", keywords: "problems errors", run: () => state.refreshLint() },
      { id: "credits", label: "Open credits and licenses", group: "Tools", keywords: "legal attribution", run: () => window.open(asset("/credits/"), "_self") },
      { id: "home", label: "Back to cmdlib.dev", group: "Tools", keywords: "landing home", run: () => window.open("/", "_self") },
    ];
    for (const id of PANEL_ORDER) {
      base.push({
        id: `panel-${id}`,
        label: `Open ${PANEL_LABELS[id]}`,
        hint: "window",
        group: "Windows",
        keywords: "panel dock",
        run: () => state.requestPanel(id),
      });
    }
    for (const [path] of Object.entries(state.project.files)) {
      base.push({
        id: `file-${path}`,
        label: path,
        hint: "file",
        group: "Files",
        keywords: "open edit function",
        run: () => state.openFile(path),
      });
    }
    for (const version of VERSIONS.slice(0, 6)) {
      base.push({
        id: `version-${version.id}`,
        label: `Target ${version.label}`,
        hint: `format ${version.packFormat.join(".")}`,
        group: "Versions",
        keywords: "switch minecraft",
        run: () => state.setVersion(version.id),
      });
    }
    return base;
  }, [open]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.group} ${action.keywords ?? ""}`.toLowerCase().includes(value),
    );
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((value) => Math.min(filtered.length - 1, value + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((value) => Math.max(0, value - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const action = filtered[selected];
        if (action) {
          setOpen(false);
          action.run();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, selected, setOpen]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className={styles.paletteOverlay} role="presentation" onMouseDown={() => setOpen(false)}>
      <div
        className={styles.palette}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.paletteInputRow}>
          <span className={styles.palettePrompt}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Run a command, open a panel, jump to a file…"
            aria-label="Search actions"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className={styles.paletteList} ref={listRef}>
          {filtered.length === 0 && <p className={styles.paletteEmpty}>No action matches “{query}”.</p>}
          {filtered.slice(0, 40).map((action, index) => {
            const showGroup = action.group !== lastGroup;
            lastGroup = action.group;
            return (
              <div key={action.id}>
                {showGroup && <div className={styles.paletteGroup}>{action.group}</div>}
                <button
                  type="button"
                  data-index={index}
                  className={`${styles.paletteItem} ${selected === index ? styles.paletteItemActive : ""}`}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => {
                    setOpen(false);
                    action.run();
                  }}
                >
                  <span>{action.label}</span>
                  {action.hint && <span className={styles.paletteHint}>{action.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className={styles.paletteFoot}>
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
