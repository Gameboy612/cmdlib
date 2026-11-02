"use client";

import { useWorkbench, type MobilePanel } from "@/lib/state/workbench";
import { AdvancementsPanel, CodePanel, ConsolePanel, ExplorerPanel, PreviewPanel, ProblemsPanel } from "./panels";
import { InventoryPanel } from "./InventoryPanel";
import { TimelinePanel } from "./TimelinePanel";
import styles from "./editor.module.css";

const TABS: Array<{ id: MobilePanel; label: string }> = [
  { id: "explorer", label: "Files" },
  { id: "editor", label: "Code" },
  { id: "preview", label: "World" },
  { id: "console", label: "Console" },
  { id: "problems", label: "Problems" },
  { id: "timeline", label: "Timeline" },
  { id: "advancements", label: "Advancements" },
  { id: "inventory", label: "Inventory" },
];

export function MobileWorkspace() {
  const panel = useWorkbench((state) => state.mobilePanel);
  const setPanel = useWorkbench((state) => state.setMobilePanel);
  const errors = useWorkbench((state) => state.lintReport.errors);

  return (
    <div className={styles.mobile}>
      <div className={styles.mobileTabs} role="tablist" aria-label="Workbench panels">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            className={`${styles.mobileTab} ${panel === tab.id ? styles.mobileTabActive : ""}`}
            onClick={() => setPanel(tab.id)}
          >
            {tab.label}
            {tab.id === "problems" && errors > 0 && <span className={styles.mobileBadge}>{errors}</span>}
          </button>
        ))}
      </div>
      <div className={styles.mobileBody}>
        {panel === "explorer" && <ExplorerPanel />}
        {panel === "editor" && <CodePanel />}
        {panel === "preview" && <PreviewPanel />}
        {panel === "console" && <ConsolePanel />}
        {panel === "problems" && <ProblemsPanel />}
        {panel === "timeline" && <TimelinePanel />}
        {panel === "advancements" && <AdvancementsPanel />}
        {panel === "inventory" && <InventoryPanel />}
      </div>
    </div>
  );
}
