"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { VERSIONS, formatPackFormat, getVersion } from "@/lib/mc/version";
import { PANEL_LABELS, PANEL_ORDER } from "./panel-meta";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";

export function Toolbar() {
  const project = useWorkbench((state) => state.project);
  const setProjectName = useWorkbench((state) => state.setProjectName);
  const setVersion = useWorkbench((state) => state.setVersion);
  const runLoad = useWorkbench((state) => state.runLoad);
  const runDemo = useWorkbench((state) => state.runDemo);
  const runActive = useWorkbench((state) => state.runActive);
  const exportZip = useWorkbench((state) => state.exportZip);
  const importZip = useWorkbench((state) => state.importZip);
  const setPaletteOpen = useWorkbench((state) => state.setPaletteOpen);
  const requestPanel = useWorkbench((state) => state.requestPanel);
  const resetLayout = useWorkbench((state) => state.resetLayout);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const version = getVersion(project.versionId);

  useEffect(() => {
    if (!panelsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setPanelsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [panelsOpen]);

  const commitName = () => {
    const next = draft.trim();
    if (next && next !== project.name) setProjectName(next);
    setEditing(false);
  };

  return (
    <header className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <Link href="/" className={styles.toolbarBrand} title="Back to cmdlib.dev">
          <img src={asset("/art/mark.svg")} alt="" width={22} height={22} />
        </Link>
        <span className={styles.toolbarDivider} />
        {editing ? (
          <input
            className={styles.projectInput}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitName();
              if (event.key === "Escape") {
                setDraft(project.name);
                setEditing(false);
              }
            }}
            aria-label="Pack name"
          />
        ) : (
          <button type="button" className={styles.projectName} onClick={() => { setDraft(project.name); setEditing(true); }} title="Rename pack">
            {project.name}
            <span className={styles.projectEdit}>✎</span>
          </button>
        )}
        <label className={styles.versionPicker} title="Switch target version">
          <span className={styles.versionLabel}>target</span>
          <select
            value={project.versionId}
            onChange={(event) => setVersion(event.target.value)}
            aria-label="Target Minecraft version"
          >
            {VERSIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} · format {formatPackFormat(entry.packFormat)}
              </option>
            ))}
          </select>
          <span className={styles.versionChevron}>▾</span>
        </label>
      </div>

      <div className={styles.toolbarCenter}>
        <button type="button" className={styles.runButton} onClick={runLoad} title="Reload the pack and run load tags (F5)">
          <span aria-hidden>▶</span> Run
          <kbd>F5</kbd>
        </button>
        <button type="button" className={styles.toolButton} onClick={runDemo} title="Run the demo function">
          Demo
        </button>
        <button type="button" className={styles.toolButton} onClick={runActive} title="Run the active function (Ctrl/Cmd + Enter)">
          Run file
          <kbd>⌘↵</kbd>
        </button>
      </div>

      <div className={styles.toolbarRight}>
        <button type="button" className={styles.toolButton} onClick={() => fileInput.current?.click()} title="Import a datapack .zip">
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importZip(file);
            event.target.value = "";
          }}
        />
        <button type="button" className={styles.toolButton} onClick={exportZip} title="Export this pack as a .zip">
          Export
        </button>
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={`${styles.toolButton} ${panelsOpen ? styles.toolButtonOpen : ""}`}
            onClick={() => setPanelsOpen((open) => !open)}
            aria-expanded={panelsOpen}
          >
            Panels ▾
          </button>
          {panelsOpen && (
            <div className={styles.menu} role="menu">
              <span className={styles.menuLabel}>Windows</span>
              {PANEL_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    requestPanel(id);
                    setPanelsOpen(false);
                  }}
                >
                  {PANEL_LABELS[id]}
                </button>
              ))}
              <span className={styles.menuSeparator} />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  resetLayout();
                  setPanelsOpen(false);
                }}
              >
                Reset layout
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.mobileRun}
          onClick={runLoad}
          aria-label="Run load tags"
          title="Run load tags"
        >
          ▶
        </button>
        <button
          type="button"
          className={styles.paletteButton}
          onClick={() => setPaletteOpen(true)}
          title="Command palette (Ctrl/Cmd + K)"
        >
          <span>⌘K</span>
        </button>
        <span className={styles.buildChip}>{version.id}</span>
      </div>
    </header>
  );
}
