"use client";

import { create } from "zustand";
import { useMemo, useSyncExternalStore } from "react";
import { createProject, listFunctionIds, type Project } from "../mc/datapack";
import { Simulator } from "../mc/simulator";
import { buildCompletionIndex, type CompletionIndex } from "../editor/completions";
import { lintProject, type LintQuickFix, type LintReport } from "../lint";
import { buildPackMeta, functionPath, getVersion, migrateFiles } from "../mc/version";
import { downloadProject, readProjectZip } from "../io";

const PROJECT_KEY = "cmdlib:project:v1";
const LAYOUT_KEY = "cmdlib:layout:v1";
const HISTORY_KEY = "cmdlib:history:v1";

export type MobilePanel = "editor" | "preview" | "console" | "explorer" | "problems";

export interface Toast {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

interface WorkbenchState {
  project: Project;
  sim: Simulator;
  activePath: string;
  openTabs: string[];
  selectedEntity: string | null;
  lintReport: LintReport;
  hydrated: boolean;
  booting: boolean;
  toast: Toast | null;
  paletteOpen: boolean;
  mobilePanel: MobilePanel;
  layoutJson: string | null;
  layoutNonce: number;
  recentCommands: string[];
  cursor: { line: number; column: number };
  goto: { path: string; line: number; column: number; nonce: number } | null;
  panelRequest: { id: string; nonce: number } | null;

  hydrate: () => void;
  setProject: (project: Project) => void;
  setProjectName: (name: string) => void;
  setVersion: (versionId: string) => void;
  updateFile: (path: string, content: string) => void;
  createFile: (path: string, content?: string) => boolean;
  deleteFile: (path: string) => void;
  renameFile: (from: string, to: string) => boolean;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  selectEntity: (uuid: string | null) => void;
  refreshLint: () => LintReport;
  runLoad: () => void;
  runActive: () => void;
  runDemo: () => void;
  runCommand: (line: string) => void;
  clearConsole: () => void;
  applyQuickFix: (fix: LintQuickFix) => void;
  importZip: (file: File) => Promise<void>;
  exportZip: () => void;
  newProject: () => void;
  setLayout: (json: string) => void;
  resetLayout: () => void;
  showToast: (message: string, kind?: Toast["kind"]) => void;
  setPaletteOpen: (open: boolean) => void;
  setMobilePanel: (panel: MobilePanel) => void;
  setCursor: (line: number, column: number) => void;
  goTo: (path: string, line: number, column?: number) => void;
  requestPanel: (id: string) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lintTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;

function readStoredProject(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Project>;
    if (!parsed || typeof parsed !== "object" || !parsed.files) return null;
    const files: Record<string, string> = {};
    for (const [rawPath, content] of Object.entries(parsed.files)) {
      if (typeof content === "string") files[rawPath.replace(/^\/+/, "")] = content;
    }
    if (Object.keys(files).length === 0) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "Imported Pack",
      versionId: getVersion(String(parsed.versionId ?? "26.3")).id,
      files,
      activePath:
        parsed.activePath && parsed.activePath in files
          ? parsed.activePath
          : Object.keys(files)[0] ?? "",
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function persist(project: Project): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
    } catch {
      // A full quota should never break the editor.
    }
  }, 400);
}

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(0, 30)
      : [];
  } catch {
    return [];
  }
}

const initialProject = createProject("26.3");
const initialSim = new Simulator({ project: initialProject });

const emptyLint: LintReport = {
  diagnostics: [],
  errors: 0,
  warnings: 0,
  infos: 0,
  filesLinted: 0,
  durationMs: 0,
  versionId: "26.3",
};

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  project: initialProject,
  sim: initialSim,
  activePath: initialProject.activePath,
  openTabs: [initialProject.activePath],
  selectedEntity: null,
  lintReport: emptyLint,
  hydrated: false,
  booting: true,
  toast: null,
  paletteOpen: false,
  mobilePanel: "editor",
  layoutJson: null,
  layoutNonce: 0,
  recentCommands: [],
  cursor: { line: 1, column: 1 },
  goto: null,
  panelRequest: null,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = readStoredProject();
    const project = stored ?? get().project;
    const sim = new Simulator({ project });
    sim.reset();
    const layoutJson =
      typeof window !== "undefined" ? window.localStorage.getItem(LAYOUT_KEY) : null;
    set({
      project,
      sim,
      activePath: project.activePath,
      openTabs: project.activePath ? [project.activePath] : [],
      lintReport: lintProject(project),
      hydrated: true,
      booting: false,
      layoutJson,
      recentCommands: readHistory(),
    });
    sim.touch();
  },

  setProject: (project) => {
    get().sim.setProject(project);
    set({ project, selectedEntity: null });
    persist(project);
    scheduleLint(get);
  },

  setProjectName: (name) => {
    get().setProject({ ...get().project, name, updatedAt: Date.now() });
  },

  setVersion: (versionId) => {
    const project = get().project;
    const from = getVersion(project.versionId);
    const to = getVersion(versionId);
    if (from.id === to.id) return;
    const files = migrateFiles(project.files, from, to, project.name);
    const activePath =
      project.activePath.replace(
        `/${from.functionFolder}/`,
        `/${to.functionFolder}/`,
      ) in files
        ? project.activePath.replace(`/${from.functionFolder}/`, `/${to.functionFolder}/`)
        : Object.keys(files)[0] ?? "";
    const next: Project = {
      ...project,
      versionId: to.id,
      files,
      activePath,
      updatedAt: Date.now(),
    };
    const sim = get().sim;
    sim.project = next;
    sim.version = to;
    sim.setProject(next);
    sim.reset();
    set({
      project: next,
      activePath,
      openTabs: activePath ? [activePath] : [],
      selectedEntity: null,
    });
    persist(next);
    scheduleLint(get);
    get().showToast(`Switched to ${to.label} · folders and pack.mcmeta migrated`, "success");
  },

  updateFile: (path, content) => {
    const project = get().project;
    if (project.files[path] === content) return;
    const next: Project = {
      ...project,
      files: { ...project.files, [path]: content },
      updatedAt: Date.now(),
    };
    get().sim.setProject(next);
    set({ project: next });
    persist(next);
    scheduleLint(get);
  },

  createFile: (rawPath, content = "") => {
    const path = rawPath.replace(/^\/+/, "");
    const project = get().project;
    if (path in project.files) {
      get().showToast(`"${path}" already exists`, "error");
      return false;
    }
    get().setProject({
      ...project,
      files: { ...project.files, [path]: content },
      updatedAt: Date.now(),
    });
    get().openFile(path);
    return true;
  },

  deleteFile: (path) => {
    const project = get().project;
    const files = { ...project.files };
    delete files[path];
    const openTabs = get().openTabs.filter((tab) => tab !== path);
    const activePath = get().activePath === path ? openTabs[0] ?? "" : get().activePath;
    get().setProject({ ...project, files, activePath, updatedAt: Date.now() });
    set({ openTabs, activePath });
    get().showToast(`Deleted ${path}`, "info");
  },

  renameFile: (from, to) => {
    if (from === to) return true;
    const project = get().project;
    if (to in project.files) {
      get().showToast(`"${to}" already exists`, "error");
      return false;
    }
    const files: Record<string, string> = {};
    for (const [path, content] of Object.entries(project.files)) {
      files[path === from ? to : path] = content;
    }
    const openTabs = get().openTabs.map((tab) => (tab === from ? to : tab));
    const activePath = get().activePath === from ? to : get().activePath;
    get().setProject({ ...project, files, activePath, updatedAt: Date.now() });
    set({ openTabs, activePath });
    get().showToast(`Renamed to ${to}`, "success");
    return true;
  },

  openFile: (path) => {
    const project = get().project;
    if (!(path in project.files)) return;
    const openTabs = get().openTabs.includes(path)
      ? get().openTabs
      : [...get().openTabs, path].slice(-8);
    set({ activePath: path, openTabs });
    if (project.activePath !== path) {
      const next = { ...project, activePath: path };
      set({ project: next });
      persist(next);
    }
  },

  closeTab: (path) => {
    const openTabs = get().openTabs.filter((tab) => tab !== path);
    const activePath =
      get().activePath === path ? openTabs[openTabs.length - 1] ?? "" : get().activePath;
    set({ openTabs, activePath });
  },

  selectEntity: (uuid) => set({ selectedEntity: uuid }),

  refreshLint: () => {
    const report = lintProject(get().project);
    set({ lintReport: report });
    return report;
  },

  runLoad: () => {
    const project = get().project;
    get().sim.setProject(project);
    get().sim.reset();
    get().showToast("Pack reloaded · load tags executed", "success");
  },

  runActive: () => {
    const { project, activePath, sim } = get();
    if (!activePath) return;
    const version = getVersion(project.versionId);
    const fn = listFunctionIds(project.files, version).find((f) => f.path === activePath);
    if (!fn) {
      sim.runFile(activePath);
      return;
    }
    if (fn.hasMacros) {
      get().showToast("This function uses macros. Call it from the console with arguments.", "info");
      return;
    }
    const outcome = sim.runCommand(`function ${fn.id}`);
    if (outcome.ok) get().showToast(`Ran ${fn.id}`, "success");
  },

  runDemo: () => {
    const outcome = get().sim.runDemo();
    if (!outcome.ok) get().showToast(outcome.error ?? "Demo function failed", "error");
  },

  runCommand: (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    get().sim.world.log("command", `/${trimmed}`);
    get().sim.runCommand(trimmed);
    const history = [trimmed, ...get().recentCommands.filter((c) => c !== trimmed)].slice(0, 30);
    set({ recentCommands: history });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch {
        // ignore
      }
    }
  },

  clearConsole: () => {
    const sim = get().sim;
    sim.world.logs = [];
    sim.world.touch();
  },

  applyQuickFix: (fix) => {
    const project = get().project;
    const version = getVersion(project.versionId);
    switch (fix.action) {
      case "fix-pack-meta": {
        get().setProject({
          ...project,
          files: { ...project.files, "pack.mcmeta": buildPackMeta(version, project.name) + "\n" },
          updatedAt: Date.now(),
        });
        get().showToast("pack.mcmeta updated", "success");
        return;
      }
      case "migrate-folders": {
        const files: Record<string, string> = {};
        for (const [path, content] of Object.entries(project.files)) {
          files[
            path
              .replace(/\/functions\//g, `/${version.functionFolder}/`)
              .replace(/\/tags\/functions\//g, `/${version.tagFolder}/`)
          ] = content;
        }
        get().setProject({ ...project, files, updatedAt: Date.now() });
        get().showToast(`Folders migrated for ${version.id}`, "success");
        return;
      }
      case "create-objective": {
        const name = fix.payload?.name;
        if (!name) return;
        const loadPath =
          Object.keys(project.files).find((path) => path.endsWith("/load.mcfunction")) ??
          get().activePath ??
          Object.keys(project.files)[0];
        if (!loadPath) return;
        const content = project.files[loadPath] ?? "";
        get().updateFile(loadPath, `scoreboard objectives add ${name} dummy\n${content}`);
        get().showToast(`Created objective '${name}'`, "success");
        return;
      }
      case "create-function": {
        const id = fix.payload?.id;
        if (!id) return;
        const path = functionPath(id, version);
        get().createFile(path, `# ${id}\n`);
        get().showToast(`Created ${path}`, "success");
        return;
      }
      case "edit": {
        if (!fix.edits) return;
        const files = { ...project.files };
        const byPath = new Map<string, NonNullable<LintQuickFix["edits"]>>();
        for (const edit of fix.edits) {
          const list = byPath.get(edit.path) ?? [];
          list.push(edit);
          byPath.set(edit.path, list);
        }
        for (const [path, edits] of byPath) {
          let content = files[path] ?? "";
          for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
            content = content.slice(0, edit.from) + edit.text + content.slice(edit.to);
          }
          files[path] = content;
        }
        get().setProject({ ...project, files, updatedAt: Date.now() });
        return;
      }
    }
  },

  importZip: async (file) => {
    try {
      const imported = await readProjectZip(file);
      const project: Project = {
        name: imported.name,
        versionId: imported.versionId,
        files: imported.files,
        activePath:
          Object.keys(imported.files).find((path) => path.endsWith(".mcfunction")) ??
          Object.keys(imported.files)[0] ??
          "",
        updatedAt: Date.now(),
      };
      const sim = get().sim;
      sim.project = project;
      sim.version = getVersion(project.versionId);
      sim.setProject(project);
      sim.reset();
      set({
        project,
        activePath: project.activePath,
        openTabs: project.activePath ? [project.activePath] : [],
        lintReport: lintProject(project),
        selectedEntity: null,
      });
      persist(project);
      get().showToast(`Imported ${file.name}`, "success");
    } catch (error) {
      get().showToast(`Import failed: ${(error as Error).message}`, "error");
    }
  },

  exportZip: () => {
    downloadProject(get().project);
    get().showToast("Pack exported as .zip", "success");
  },

  newProject: () => {
    const project = createProject(get().project.versionId, "Untitled Pack");
    const sim = get().sim;
    sim.project = project;
    sim.setProject(project);
    sim.reset();
    set({
      project,
      activePath: project.activePath,
      openTabs: [project.activePath],
      lintReport: lintProject(project),
      selectedEntity: null,
    });
    persist(project);
    get().showToast("Started a new pack", "success");
  },

  setLayout: (json) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LAYOUT_KEY, json);
      } catch {
        // ignore
      }
    }
    set({ layoutJson: json });
  },

  resetLayout: () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(LAYOUT_KEY);
    set({ layoutJson: null, layoutNonce: get().layoutNonce + 1 });
  },

  showToast: (message, kind = "info") => {
    if (toastTimer) clearTimeout(toastTimer);
    const toast: Toast = { id: ++toastId, message, kind };
    set({ toast });
    toastTimer = setTimeout(() => {
      if (get().toast?.id === toast.id) set({ toast: null });
    }, 4200);
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setMobilePanel: (panel) => set({ mobilePanel: panel }),
  setCursor: (line, column) => set({ cursor: { line, column } }),
  goTo: (path, line, column = 1) => {
    const project = get().project;
    if (!(path in project.files)) return;
    get().openFile(path);
    set({
      goto: { path, line, column, nonce: Date.now() },
    });
  },
  requestPanel: (id) => set({ panelRequest: { id, nonce: Date.now() } }),
}));

function scheduleLint(get: () => WorkbenchState): void {
  if (lintTimer) clearTimeout(lintTimer);
  lintTimer = setTimeout(() => {
    get().refreshLint();
  }, 420);
}

export function useSimRevision(): number {
  const sim = useWorkbench((state) => state.sim);
  return useSyncExternalStore(sim.subscribe, sim.getSnapshot, () => 0);
}

export function useCompletionIndex(): CompletionIndex {
  const project = useWorkbench((state) => state.project);
  const sim = useWorkbench((state) => state.sim);
  const revision = useSimRevision();
  return useMemo(
    () => buildCompletionIndex(project, getVersion(project.versionId), sim.world),
    [project, sim, revision],
  );
}

export function functionPathOf(path: string, versionId: string): string | null {
  const version = getVersion(versionId);
  const match = /^data\/([^/]+)\/([^/]+)\/(.+)\.mcfunction$/.exec(path);
  if (!match || match[2] !== version.functionFolder) return null;
  return `${match[1]}:${match[3]}`;
}
