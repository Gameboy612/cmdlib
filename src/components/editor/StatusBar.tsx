"use client";

import { useWorkbench, useSimRevision } from "@/lib/state/workbench";
import { getVersion, formatPackFormat } from "@/lib/mc/version";
import styles from "./editor.module.css";

export function StatusBar() {
  const project = useWorkbench((state) => state.project);
  const report = useWorkbench((state) => state.lintReport);
  const cursor = useWorkbench((state) => state.cursor);
  const requestPanel = useWorkbench((state) => state.requestPanel);
  const sim = useWorkbench((state) => state.sim);
  const revision = useSimRevision();
  const version = getVersion(project.versionId);
  const world = sim.world;
  const status =
    report.errors > 0 ? "error" : report.warnings > 0 ? "warning" : "ok";

  return (
    <footer className={styles.statusBar}>
      <div className={styles.statusLeft}>
        <button type="button" className={`${styles.statusItem} ${styles[`status_${status}`]}`} onClick={() => requestPanel("problems")}>
          <span className={styles.statusIcon}>{status === "ok" ? "✓" : status === "warning" ? "△" : "!"}</span>
          {report.errors} errors · {report.warnings} warnings
        </button>
        <span className={styles.statusItem}>{version.id} · format {formatPackFormat(version.packFormat)}</span>
        <span className={styles.statusItem}>Ln {cursor.line}, Col {cursor.column}</span>
      </div>
      <div className={styles.statusRight}>
        <span className={styles.statusItem}>tick {world.tick}</span>
        <span className={styles.statusItem}>{world.entities.length} entities</span>
        <span className={styles.statusItem}>static · local only</span>
        <span className={`${styles.statusItem} ${styles.statusMuted}`}>v0.1 demo</span>
      </div>
    </footer>
  );
}
