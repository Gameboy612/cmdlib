"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview-react";
import type { DockviewApi } from "dockview";
import "dockview/dist/styles/dockview.css";
import { useWorkbench } from "@/lib/state/workbench";
import { WorkspaceContext } from "./WorkspaceContext";
import {
  AdvancementsPanel,
  ConsolePanel,
  EntitiesPanel,
  ExplorerPanel,
  CodePanel,
  PreviewPanel,
  ProblemsPanel,
  ReferencePanel,
  ScoreboardPanel,
  StoragePanel,
} from "./panels";
import { TimelinePanel } from "./TimelinePanel";
import { InventoryPanel } from "./InventoryPanel";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";

const COMPONENTS: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  explorer: () => <ExplorerPanel />,
  editor: (props) => <CodePanel panelApi={props.api} />,
  preview: () => <PreviewPanel />,
  console: () => <ConsolePanel />,
  timeline: () => <TimelinePanel />,
  advancements: () => <AdvancementsPanel />,
  inventory: () => <InventoryPanel />,
  scoreboard: () => <ScoreboardPanel />,
  storage: () => <StoragePanel />,
  entities: () => <EntitiesPanel />,
  problems: () => <ProblemsPanel />,
  reference: () => <ReferencePanel />,
};

const PANEL_META: Record<string, { title: string; component: string }> = {
  explorer: { title: "Explorer", component: "explorer" },
  editor: { title: "Code", component: "editor" },
  preview: { title: "Preview", component: "preview" },
  console: { title: "Console", component: "console" },
  timeline: { title: "Timeline", component: "timeline" },
  advancements: { title: "Advancements", component: "advancements" },
  inventory: { title: "Inventory", component: "inventory" },
  scoreboard: { title: "Scores", component: "scoreboard" },
  storage: { title: "Storage", component: "storage" },
  entities: { title: "Entities", component: "entities" },
  problems: { title: "Problems", component: "problems" },
  reference: { title: "Reference", component: "reference" },
};

export function DockWorkspace() {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const savedRef = useRef<number | null>(null);
  const setLayout = useWorkbench((state) => state.setLayout);
  const resetLayout = useWorkbench((state) => state.resetLayout);
  const panelRequest = useWorkbench((state) => state.panelRequest);
  const setOpenPanels = useWorkbench((state) => state.setOpenPanels);

  const openPanel = useCallback(
    (id: string) => {
      if (!api) return;
      const existing = api.getPanel(id);
      if (existing) {
        existing.api.setActive();
        return;
      }
      const meta = PANEL_META[id];
      if (!meta) return;
      const reference = api.getPanel("preview") ?? api.getPanel("editor") ?? api.getPanel("explorer");
      api.addPanel({
        id,
        component: meta.component,
        title: meta.title,
        position: reference ? { referencePanel: reference.id, direction: "within" } : undefined,
      });
    },
    [api],
  );

  useEffect(() => {
    if (!api) return;
    const syncPanels = () => setOpenPanels(api.panels.map((panel) => panel.id));
    syncPanels();
    const disposable = api.onDidLayoutChange(() => {
      syncPanels();
      if (savedRef.current) window.clearTimeout(savedRef.current);
      savedRef.current = window.setTimeout(() => {
        try {
          setLayout(JSON.stringify(api.toJSON()));
        } catch {
          // A layout snapshot can fail while a group is mid-animation; the
          // next change will try again.
        }
      }, 350);
    });
    return () => disposable.dispose();
  }, [api, setLayout, setOpenPanels]);

  useEffect(() => {
    if (!api || !panelRequest) return;
    const panel = api.getPanel(panelRequest.id);
    if (panel) panel.api.setActive();
    else openPanel(panelRequest.id);
  }, [api, panelRequest, openPanel]);

  const onReady = (event: DockviewReadyEvent) => {
    const dock = event.api;
    setApi(dock);
    const saved = useWorkbench.getState().layoutJson;
    let restored = false;
    if (saved) {
      try {
        dock.fromJSON(JSON.parse(saved));
        restored = true;
      } catch {
        restored = false;
      }
    }

    if (!restored) {
      buildDefaultLayout(dock);
      const applySizes = () => {
        dock.getPanel("explorer")?.api.setSize({ width: 224 });
        dock.getPanel("preview")?.api.setSize({ width: 440 });
        dock.getEdgeGroup("bottom")?.setSize({ height: 210 });
      };
      requestAnimationFrame(applySizes);
      window.setTimeout(applySizes, 120);
    }
    ensurePanels(dock);
    setOpenPanels(dock.panels.map((panel) => panel.id));
    dock.getPanel("editor")?.api.setActive();
  };

  return (
    <WorkspaceContext.Provider value={{ api, openPanel, resetLayout }}>
      <div className={`dockview-theme-dark ${styles.dock}`}>
        <DockviewReact
          components={COMPONENTS}
          onReady={onReady}
          getTabContextMenuItems={() => [
            "close",
            "closeOthers",
            "separator",
            "float",
            "maximize",
            "separator",
            "closeAll",
            {
              label: "Reset layout",
              action: () => useWorkbench.getState().resetLayout(),
            },
          ]}
          watermarkComponent={() => (
            <div className={styles.watermark}>
              <img src={asset("/art/mark.svg")} alt="" width={40} height={40} />
              <span>All panels are closed.</span>
              <span>Open one from the View menu, or reset the layout.</span>
            </div>
          )}
        />
      </div>
    </WorkspaceContext.Provider>
  );
}

function buildDefaultLayout(api: DockviewApi): void {
  api.addPanel({
    id: "explorer",
    component: "explorer",
    title: "Explorer",
    initialWidth: 232,
  });
  api.addPanel({
    id: "editor",
    component: "editor",
    title: "Editor",
    position: { referencePanel: "explorer", direction: "right" },
    initialWidth: 620,
  });
  api.addPanel({
    id: "preview",
    component: "preview",
    title: "Preview",
    position: { referencePanel: "editor", direction: "right" },
    initialWidth: 480,
  });
  // The console belongs to a full-width bottom edge group. If the build of
  // dockview does not support edge groups, fall back to a normal bottom split.
  try {
    api.addEdgeGroup("bottom", {
      id: "console-edge",
      initialSize: 220,
      minimumSize: 120,
      collapsed: false,
      autoHide: false,
    });
    const edgeApi = api.getEdgeGroup("bottom");
    edgeApi?.setHeaderPosition("top");
    const edge = edgeApi ? api.groups.find((group) => group.api === edgeApi) : undefined;
    if (edge) {
      api.addPanel({
        id: "console",
        component: "console",
        title: "Console",
        position: { referenceGroup: edge, direction: "within" },
      });
      if (api.getPanel("console")) {
        api.addPanel({
          id: "timeline",
          component: "timeline",
          title: "Timeline",
          position: { referencePanel: "console", direction: "within" },
          inactive: true,
        });
      }
    }
  } catch {
    api.addPanel({
      id: "console",
      component: "console",
      title: "Console",
      position: { referencePanel: "editor", direction: "below" },
      initialHeight: 220,
    });
    api.addPanel({
      id: "timeline",
      component: "timeline",
      title: "Timeline",
      position: { referencePanel: "console", direction: "within" },
      inactive: true,
    });
    api.addPanel({
      id: "advancements",
      component: "advancements",
      title: "Advancements",
      position: { referencePanel: "timeline", direction: "within" },
      inactive: true,
    });
    api.addPanel({
      id: "inventory",
      component: "inventory",
      title: "Inventory",
      position: { referencePanel: "advancements", direction: "within" },
      inactive: true,
    });
  }
}

const CORE_PANELS = ["explorer", "editor", "preview", "console"];

function ensurePanels(api: DockviewApi): void {
  for (const id of CORE_PANELS) {
    const meta = PANEL_META[id];
    if (api.getPanel(id)) continue;
    if (id === "console") {
      const edgeApi = api.getEdgeGroup("bottom");
      const edge = edgeApi ? api.groups.find((group) => group.api === edgeApi) : undefined;
      if (edge) {
        api.addPanel({
          id,
          component: meta.component,
          title: meta.title,
          position: { referenceGroup: edge, direction: "within" },
        });
        continue;
      }
    }
    const reference = api.getPanel("preview") ?? api.getPanel("editor");
    api.addPanel({
      id,
      component: meta.component,
      title: meta.title,
      position: reference ? { referencePanel: reference.id, direction: "within" } : undefined,
      inactive: true,
    });
  }
}
