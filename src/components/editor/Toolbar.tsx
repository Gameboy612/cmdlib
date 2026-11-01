"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { VERSIONS, formatPackFormat } from "@/lib/mc/version";
import { MenuBar } from "./MenuBar";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";

export function Toolbar() {
  const project = useWorkbench((state) => state.project);
  const setProjectName = useWorkbench((state) => state.setProjectName);
  const setVersion = useWorkbench((state) => state.setVersion);
  const runLoad = useWorkbench((state) => state.runLoad);
  const setPaletteOpen = useWorkbench((state) => state.setPaletteOpen);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);

  const commitName = () => {
    const next = draft.trim();
    if (next && next !== project.name) setProjectName(next);
    setEditing(false);
  };

  return (
    <header className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <Link href="/" className={styles.toolbarBrand} title="cmdlib home">
          <img src={asset("/art/mark.svg")} alt="" width={21} height={21} />
        </Link>
        <MenuBar />
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
          <button
            type="button"
            className={styles.projectName}
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
            title="Rename pack"
          >
            {project.name}
          </button>
        )}
        <label className={styles.versionPicker} title="Switch target version">
          <select
            value={project.versionId}
            onChange={(event) => setVersion(event.target.value)}
            aria-label="Target Minecraft version"
          >
            {VERSIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} · {formatPackFormat(entry.packFormat)}
              </option>
            ))}
          </select>
          <span className={styles.versionChevron}>▾</span>
        </label>
      </div>

      <div className={styles.toolbarCenter}>
        <button type="button" className={styles.runButton} onClick={runLoad} title="Run load tags">
          <span aria-hidden>▶</span> Run
        </button>
      </div>

      <div className={styles.toolbarRight}>
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
          title="Command palette"
        >
          Palette
        </button>
      </div>
    </header>
  );
}
