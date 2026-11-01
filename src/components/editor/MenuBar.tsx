"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { getVersion } from "@/lib/mc/version";
import { dispatchEditorCommand } from "@/lib/editor/commands";
import { PANEL_LABELS } from "./panel-meta";
import styles from "./editor.module.css";

interface MenuAction {
  label: string;
  hint?: string;
  run: () => void;
  separator?: never;
}
interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuAction | MenuSeparator;

interface Menu {
  label: string;
  items: MenuEntry[];
}

const MENU_ORDER = ["File", "Edit", "Selection", "View", "Go", "Run", "Help"];

export function MenuBar() {
  const project = useWorkbench((state) => state.project);
  const activePath = useWorkbench((state) => state.activePath);
  const runLoad = useWorkbench((state) => state.runLoad);
  const runActive = useWorkbench((state) => state.runActive);
  const clearConsole = useWorkbench((state) => state.clearConsole);
  const newProject = useWorkbench((state) => state.newProject);
  const createFile = useWorkbench((state) => state.createFile);
  const importZip = useWorkbench((state) => state.importZip);
  const exportZip = useWorkbench((state) => state.exportZip);
  const setPaletteOpen = useWorkbench((state) => state.setPaletteOpen);
  const requestPanel = useWorkbench((state) => state.requestPanel);
  const resetLayout = useWorkbench((state) => state.resetLayout);
  const goTo = useWorkbench((state) => state.goTo);
  const showToast = useWorkbench((state) => state.showToast);
  const [open, setOpen] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const version = getVersion(project.versionId);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const namespace = /^data\/([^/]+)\//.exec(activePath)?.[1] ?? "cmdlib";

  const newFunction = () => {
    const raw = window.prompt("New function name", "new_function");
    if (!raw) return;
    const name = raw
      .trim()
      .replace(/^data\/.+\//, "")
      .replace(/\.mcfunction$/, "")
      .replace(/\s+/g, "_");
    if (!name) return;
    createFile(
      `data/${namespace}/${version.functionFolder}/${name}.mcfunction`,
      `# ${namespace}:${name}\n`,
    );
  };

  const newFile = () => {
    const raw = window.prompt("File path", `data/${namespace}/${version.functionFolder}/utility.mcfunction`);
    if (!raw) return;
    const path = raw.trim().replace(/^\/+/, "");
    createFile(path, path.endsWith(".json") ? "{}\n" : "");
  };

  const goToLine = () => {
    if (!activePath) return;
    const raw = window.prompt("Go to line", "1");
    if (!raw) return;
    const line = Number(raw);
    if (!Number.isFinite(line) || line < 1) {
      showToast("Enter a line number", "error");
      return;
    }
    goTo(activePath, Math.floor(line));
  };

  const openCredits = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/credits/`;
  };

  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "New pack", run: newProject },
        { label: "New file", run: newFile },
        { label: "New function", run: newFunction },
        { separator: true },
        { label: "Import pack…", run: () => importRef.current?.click() },
        { label: "Export pack", run: exportZip },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", hint: "Ctrl Z", run: () => dispatchEditorCommand("undo") },
        { label: "Redo", hint: "Ctrl Shift Z", run: () => dispatchEditorCommand("redo") },
        { separator: true },
        { label: "Find", hint: "Ctrl F", run: () => dispatchEditorCommand("find") },
        { label: "Command palette", hint: "Ctrl K", run: () => setPaletteOpen(true) },
      ],
    },
    {
      label: "Selection",
      items: [
        { label: "Select all", run: () => dispatchEditorCommand("selectAll") },
        { label: "Copy", run: () => dispatchEditorCommand("copy") },
        { label: "Cut", run: () => dispatchEditorCommand("cut") },
      ],
    },
    {
      label: "View",
      items: [
        ...Object.entries(PANEL_LABELS).map(([id, label]) => ({
          label,
          run: () => requestPanel(id),
        })),
        { separator: true as const },
        { label: "Reset layout", run: resetLayout },
      ],
    },
    {
      label: "Go",
      items: [
        { label: "Go to file", hint: "Ctrl P", run: () => setPaletteOpen(true) },
        { label: "Go to line", run: goToLine },
        { label: "Problems", run: () => requestPanel("problems") },
      ],
    },
    {
      label: "Run",
      items: [
        { label: "Run load tags", run: runLoad },
        { label: "Run active function", run: runActive },
        { separator: true },
        { label: "Clear console", run: clearConsole },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Credits & licenses", run: openCredits },
        { label: "GitHub repository", run: () => window.open("https://github.com/Gameboy612/cmdlib", "_blank", "noreferrer") },
      ],
    },
  ];

  return (
    <div className={styles.menubar} ref={wrapRef}>
      <input
        ref={importRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importZip(file);
          event.target.value = "";
        }}
      />
      {MENU_ORDER.map((label) => {
        const menu = menus.find((entry) => entry.label === label);
        if (!menu) return null;
        return (
          <div key={label} className={styles.menuRoot}>
            <button
              type="button"
              className={`${styles.menuTrigger} ${open === label ? styles.menuTriggerOpen : ""}`}
              aria-expanded={open === label}
              onClick={() => setOpen((value) => (value === label ? null : label))}
              onMouseEnter={() => { if (open) setOpen(label); }}
            >
              {label}
            </button>
            {open === label && (
              <div className={styles.menuPanel} role="menu">
                {menu.items.map((item, index) =>
                  "separator" in item ? (
                    <div key={`sep-${index}`} className={styles.menuRule} />
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        setOpen(null);
                        item.run();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.hint && <span className={styles.menuHint}>{item.hint}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
