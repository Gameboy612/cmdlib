"use client";

import { create } from "zustand";
import { useMemo, useSyncExternalStore } from "react";
import { createProject, listFunctionIds, type Project } from "../mc/datapack";
import { newId } from "../ids";
import {
  activePackOf,
  createWorkspace,
  uniquePackName,
  uniqueProjectName,
  updatePackInProject,
  type WorkspaceProject,
} from "../projects";
import { Simulator } from "../mc/simulator";
import { buildCompletionIndex, type CompletionIndex } from "../editor/completions";
import { lintProject, type LintQuickFix, type LintReport } from "../lint";
import { buildPackMeta, functionPath, getVersion, migrateFiles } from "../mc/version";
import { downloadProject, readProjectZip } from "../io";
import { importGithubDatapacks } from "../github";

const PROJECTS_KEY = "cmdlib:projects:v1";
const LEGACY_PROJECT_KEY = "cmdlib:project:v2";
const LAYOUT_KEY = "cmdlib:layout:v2";
const HISTORY_KEY = "cmdlib:history:v1";

export type MobilePanel = "editor" | "preview" | "console" | "explorer" | "problems" | "timeline";

export interface ExplorerCreateRequest {
  kind: "file" | "function" | "tag";
  folder?: string;
  tagKind?: string;
  nonce: number;
}

export interface Toast {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

interface WorkbenchState {
  projects: WorkspaceProject[];
  activeProjectId: string;
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
  openPanels: string[];
  preferencesOpen: boolean;
  recentCommands: string[];
  cursor: { line: number; column: number };
  goto: { path: string; line: number; column: number; nonce: number } | null;
  panelRequest: { id: string; nonce: number } | null;
  explorerCreate: ExplorerCreateRequest | null;

  hydrate: () => void;
  setProject: (project: Project) => void;
  setProjectName: (name: string) => void;
  setPackName: (packId: string, name: string) => void;
  createProject: (name?: string) => string;
  importGithubProject: (url: string) => Promise<string>;
  importProjectZip: (file: File) => Promise<string>;
  openProject: (id: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  addPack: (name?: string) => string;
  selectPack: (id: string) => void;
  deletePack: (id: string) => void;
  renamePackInProject: (projectId: string, packId: string, name: string) => void;
  deletePackInProject: (projectId: string, packId: string) => void;
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
  runCommand: (line: string) => void;
  clearConsole: () => void;
  applyQuickFix: (fix: LintQuickFix) => void;
  importZip: (file: File) => Promise<void>;
  exportZip: () => void;
  setLayout: (json: string) => void;
  resetLayout: () => void;
  showToast: (message: string, kind?: Toast["kind"]) => void;
  setPaletteOpen: (open: boolean) => void;
  setMobilePanel: (panel: MobilePanel) => void;
  setCursor: (line: number, column: number) => void;
  goTo: (path: string, line: number, column?: number) => void;
  requestPanel: (id: string) => void;
  setOpenPanels: (ids: string[]) => void;
  setPreferencesOpen: (open: boolean) => void;
  requestExplorerCreate: (request: Omit<ExplorerCreateRequest, "nonce">) => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lintTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastId = 0;

function normalizeFiles(rawFiles: unknown): Record<string, string> | null {
  if (!rawFiles || typeof rawFiles !== "object") return null;
  const files: Record<string, string> = {};
  for (const [rawPath, content] of Object.entries(rawFiles as Record<string, unknown>)) {
    if (typeof content === "string") files[rawPath.replace(/^\/+/, "")] = content;
  }
  return Object.keys(files).length > 0 ? files : null;
}

function normalizePack(raw: Partial<Project> | null | undefined, fallbackName = "Untitled Pack"): Project | null {
  if (!raw) return null;
  const files = normalizeFiles(raw.files);
  if (!files) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId("pack"),
    name: typeof raw.name === "string" && raw.name ? raw.name : fallbackName,
    versionId: getVersion(String(raw.versionId ?? "26.3")).id,
    files,
    activePath:
      raw.activePath && raw.activePath in files
        ? raw.activePath
        : Object.keys(files)[0] ?? "",
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}

function normalizeWorkspace(raw: Partial<WorkspaceProject> | null | undefined): WorkspaceProject | null {
  if (!raw || typeof raw !== "object") return null;
  const packs = Array.isArray(raw.packs)
    ? raw.packs
        .map((pack) => normalizePack(pack as Partial<Project>))
        .filter((pack): pack is Project => pack !== null)
    : [];
  if (packs.length === 0) return null;
  const activePackId =
    typeof raw.activePackId === "string" && packs.some((pack) => pack.id === raw.activePackId)
      ? raw.activePackId
      : packs[0].id;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId("project"),
    name: typeof raw.name === "string" && raw.name ? raw.name : "Untitled Project",
    packs,
    activePackId,
    githubUrl: typeof raw.githubUrl === "string" ? raw.githubUrl : undefined,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}

function readStoredWorkspaces(): { projects: WorkspaceProject[]; activeProjectId: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        projects?: Partial<WorkspaceProject>[];
        activeProjectId?: string;
      };
      const projects = Array.isArray(parsed.projects)
        ? parsed.projects
            .map((project) => normalizeWorkspace(project))
            .filter((project): project is WorkspaceProject => project !== null)
        : [];
      if (projects.length > 0) {
        const activeProjectId =
          typeof parsed.activeProjectId === "string" &&
          projects.some((project) => project.id === parsed.activeProjectId)
            ? parsed.activeProjectId
            : projects[0].id;
        return { projects, activeProjectId };
      }
    }

    // Migrate the single-pack format used by earlier builds.
    const legacyRaw = window.localStorage.getItem(LEGACY_PROJECT_KEY);
    if (!legacyRaw) return null;
    const pack = normalizePack(JSON.parse(legacyRaw) as Partial<Project>, "Imported Pack");
    if (!pack) return null;
    // Earlier builds shipped a Bounty Board demo as the default project. Do not
    // resurrect it into the clean multi-pack workspace.
    const legacyDemo =
      pack.name === "Bounty Board" &&
      Object.keys(pack.files).some((path) => path.endsWith("/demo.mcfunction"));
    if (legacyDemo) return null;
    const project: WorkspaceProject = {
      id: newId("project"),
      name: "My Project",
      packs: [pack],
      activePackId: pack.id,
      updatedAt: Date.now(),
    };
    return { projects: [project], activeProjectId: project.id };
  } catch {
    return null;
  }
}

function persistWorkspaces(projects: WorkspaceProject[], activeProjectId: string): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(
        PROJECTS_KEY,
        JSON.stringify({ projects, activeProjectId }),
      );
    } catch {
      // A full quota should never break the editor.
    }
  }, 400);
}

function syncPackIntoProjects(
  projects: WorkspaceProject[],
  activeProjectId: string,
  pack: Project,
): WorkspaceProject[] {
  return projects.map((project) =>
    project.id === activeProjectId ? updatePackInProject(project, pack) : project,
  );
}

function lintActivePack(
  project: Project,
  projects: WorkspaceProject[],
  activeProjectId: string,
): LintReport {
  const workspace = projects.find((entry) => entry.id === activeProjectId);
  const objectiveSources =
    workspace?.packs
      .filter((pack) => pack.id !== project.id)
      .map((pack) => pack.files) ?? [];
  return lintProject(project, { objectiveSources });
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

const initialWorkspace = createWorkspace("My Project", "26.3");
const initialProject = activePackOf(initialWorkspace);
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
  projects: [initialWorkspace],
  activeProjectId: initialWorkspace.id,
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
  openPanels: ["explorer", "editor", "preview", "console"],
  preferencesOpen: false,
  recentCommands: [],
  cursor: { line: 1, column: 1 },
  goto: null,
  panelRequest: null,
  explorerCreate: null,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = readStoredWorkspaces();
    const projects = stored?.projects ?? get().projects;
    const activeProjectId = stored?.activeProjectId ?? get().activeProjectId;
    const workspace =
      projects.find((entry) => entry.id === activeProjectId) ?? projects[0];
    const project = activePackOf(workspace);
    const sim = new Simulator({ project });
    sim.reset();
    const layoutJson =
      typeof window !== "undefined" ? window.localStorage.getItem(LAYOUT_KEY) : null;
    set({
      projects,
      activeProjectId: workspace.id,
      project,
      sim,
      activePath: project.activePath,
      openTabs: project.activePath ? [project.activePath] : [],
      lintReport: lintActivePack(project, projects, workspace.id),
      hydrated: true,
      booting: false,
      layoutJson,
      recentCommands: readHistory(),
    });
    sim.touch();
  },

  setProject: (project) => {
    const activeProjectId = get().activeProjectId;
    const projects = syncPackIntoProjects(get().projects, activeProjectId, project);
    get().sim.setProject(project);
    set({ project, projects, selectedEntity: null });
    persistWorkspaces(projects, activeProjectId);
    scheduleLint(get);
  },

  setProjectName: (name) => {
    get().setPackName(get().project.id, name);
  },

  setPackName: (packId, name) => {
    const activeProjectId = get().activeProjectId;
    const workspace = get().projects.find((entry) => entry.id === activeProjectId);
    if (!workspace) return;
    const packs = workspace.packs.map((pack) =>
      pack.id === packId ? { ...pack, name, updatedAt: Date.now() } : pack,
    );
    const projects = get().projects.map((entry) =>
      entry.id === activeProjectId ? { ...entry, packs, updatedAt: Date.now() } : entry,
    );
    set({
      projects,
      project: get().project.id === packId ? { ...get().project, name } : get().project,
    });
    persistWorkspaces(projects, activeProjectId);
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
    const activeProjectId = get().activeProjectId;
    const projects = syncPackIntoProjects(get().projects, activeProjectId, next);
    sim.project = next;
    sim.version = to;
    sim.setProject(next);
    sim.reset();
    set({
      project: next,
      projects,
      activePath,
      openTabs: activePath ? [activePath] : [],
      selectedEntity: null,
    });
    persistWorkspaces(projects, activeProjectId);
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
    const activeProjectId = get().activeProjectId;
    const projects = syncPackIntoProjects(get().projects, activeProjectId, next);
    get().sim.setProject(next);
    set({ project: next, projects });
    persistWorkspaces(projects, activeProjectId);
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
      : [...get().openTabs, path].slice(-24);
    set({ activePath: path, openTabs });
    if (project.activePath !== path) {
      const next = { ...project, activePath: path };
      const activeProjectId = get().activeProjectId;
      const projects = syncPackIntoProjects(get().projects, activeProjectId, next);
      set({ project: next, projects });
      persistWorkspaces(projects, activeProjectId);
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
    const report = lintActivePack(
      get().project,
      get().projects,
      get().activeProjectId,
    );
    set({ lintReport: report });
    return report;
  },

  runLoad: () => {
    const project = get().project;
    const sim = get().sim;
    sim.setProject(project);
    sim.reset();
    sim.world.log("command", "/reload");
    sim.world.log("system", "Reloaded functions and ran load tags");
    sim.touch();
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
        const from =
          getVersion(project.versionId).id === version.id
            ? getVersion("1.20.4")
            : getVersion(project.versionId);
        const files = migrateFiles(project.files, from, version, project.name);
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

  selectPack: (id) => {
    const activeProjectId = get().activeProjectId;
    const workspace = get().projects.find((entry) => entry.id === activeProjectId);
    const pack = workspace?.packs.find((entry) => entry.id === id);
    if (!workspace || !pack) return;
    const nextWorkspace: WorkspaceProject = {
      ...workspace,
      activePackId: pack.id,
      updatedAt: Date.now(),
    };
    const projects = get().projects.map((entry) =>
      entry.id === activeProjectId ? nextWorkspace : entry,
    );
    const sim = get().sim;
    sim.project = pack;
    sim.version = getVersion(pack.versionId);
    sim.setProject(pack);
    sim.reset();
    set({
      projects,
      project: pack,
      activePath: pack.activePath,
      openTabs: pack.activePath ? [pack.activePath] : [],
      lintReport: lintActivePack(pack, projects, activeProjectId),
      selectedEntity: null,
    });
    persistWorkspaces(projects, activeProjectId);
  },

  addPack: (name) => {
    const activeProjectId = get().activeProjectId;
    const workspace = get().projects.find((entry) => entry.id === activeProjectId);
    if (!workspace) return "";
    const pack = createProject(
      get().project.versionId,
      name ?? uniquePackName(workspace),
    );
    const projects = get().projects.map((entry) =>
      entry.id === activeProjectId
        ? {
            ...entry,
            packs: [...entry.packs, pack],
            activePackId: pack.id,
            updatedAt: Date.now(),
          }
        : entry,
    );
    set({ projects });
    persistWorkspaces(projects, activeProjectId);
    get().selectPack(pack.id);
    get().showToast(`Added ${pack.name}`, "success");
    return pack.id;
  },

  renamePackInProject: (projectId, packId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const projects = get().projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            packs: project.packs.map((pack) =>
              pack.id === packId ? { ...pack, name: trimmed } : pack,
            ),
            updatedAt: Date.now(),
          }
        : project,
    );
    set({
      projects,
      project:
        projectId === get().activeProjectId && packId === get().project.id
          ? { ...get().project, name: trimmed }
          : get().project,
    });
    persistWorkspaces(projects, get().activeProjectId);
  },

  deletePackInProject: (projectId, packId) => {
    const project = get().projects.find((entry) => entry.id === projectId);
    if (!project || project.packs.length <= 1) return;
    const packs = project.packs.filter((pack) => pack.id !== packId);
    const activePackId =
      project.activePackId === packId ? packs[0].id : project.activePackId;
    const projects = get().projects.map((entry) =>
      entry.id === projectId
        ? { ...entry, packs, activePackId, updatedAt: Date.now() }
        : entry,
    );
    set({ projects });
    persistWorkspaces(projects, get().activeProjectId);
    if (projectId === get().activeProjectId && project.activePackId === packId) {
      get().selectPack(activePackId);
    }
  },

  deletePack: (id) => {
    const activeProjectId = get().activeProjectId;
    const workspace = get().projects.find((entry) => entry.id === activeProjectId);
    if (!workspace || workspace.packs.length <= 1) {
      get().showToast("A project needs at least one pack", "error");
      return;
    }
    const packs = workspace.packs.filter((pack) => pack.id !== id);
    const activePackId =
      workspace.activePackId === id ? packs[0].id : workspace.activePackId;
    const projects = get().projects.map((entry) =>
      entry.id === activeProjectId
        ? { ...entry, packs, activePackId, updatedAt: Date.now() }
        : entry,
    );
    set({ projects });
    persistWorkspaces(projects, activeProjectId);
    if (workspace.activePackId === id) get().selectPack(activePackId);
    get().showToast("Pack removed", "info");
  },

  importProjectZip: async (file) => {
    const imported = await readProjectZip(file);
    const pack: Project = {
      id: newId("pack"),
      name: imported.name,
      versionId: imported.versionId,
      files: imported.files,
      activePath:
        Object.keys(imported.files).find((path) => path.endsWith(".mcfunction")) ??
        Object.keys(imported.files)[0] ??
        "",
      updatedAt: Date.now(),
    };
    const workspace: WorkspaceProject = {
      id: newId("project"),
      name: imported.name,
      packs: [pack],
      activePackId: pack.id,
      updatedAt: Date.now(),
    };
    const projects = [...get().projects, workspace];
    set({ projects, activeProjectId: workspace.id });
    get().selectPack(pack.id);
    persistWorkspaces(projects, workspace.id);
    get().showToast(`Imported project ${imported.name}`, "success");
    return workspace.id;
  },

  importGithubProject: async (url) => {
    const imported = await importGithubDatapacks(url);
    const packs: Project[] = imported.packs.map((pack) => ({
      id: newId("pack"),
      name: pack.name,
      versionId: pack.versionId,
      files: pack.files,
      activePath:
        Object.keys(pack.files).find((path) => path.endsWith(".mcfunction")) ??
        Object.keys(pack.files)[0] ??
        "",
      updatedAt: Date.now(),
    }));
    if (packs.length === 0) throw new Error("No packs found in that repository");
    const workspace: WorkspaceProject = {
      id: newId("project"),
      name: imported.name,
      packs,
      activePackId: packs[0].id,
      githubUrl: imported.url,
      updatedAt: Date.now(),
    };
    const projects = [...get().projects, workspace];
    set({ projects, activeProjectId: workspace.id });
    get().selectPack(workspace.activePackId);
    persistWorkspaces(projects, workspace.id);
    get().showToast(`Imported ${packs.length} pack${packs.length === 1 ? "" : "s"} from GitHub`, "success");
    return workspace.id;
  },

  createProject: (name) => {
    const workspace = createWorkspace(
      name ?? uniqueProjectName(get().projects),
      get().project.versionId,
    );
    const projects = [...get().projects, workspace];
    set({ projects, activeProjectId: workspace.id });
    get().selectPack(workspace.activePackId);
    persistWorkspaces(projects, workspace.id);
    get().showToast(`Created ${workspace.name}`, "success");
    return workspace.id;
  },

  openProject: (id) => {
    const workspace = get().projects.find((entry) => entry.id === id);
    if (!workspace) return;
    set({ activeProjectId: id });
    get().selectPack(workspace.activePackId);
  },

  deleteProject: (id) => {
    const remaining = get().projects.filter((entry) => entry.id !== id);
    if (remaining.length === 0) {
      const workspace = createWorkspace("My Project", get().project.versionId);
      set({ projects: [workspace], activeProjectId: workspace.id });
      get().selectPack(workspace.activePackId);
      persistWorkspaces([workspace], workspace.id);
      get().showToast("Project removed", "info");
      return;
    }
    const nextProjects =
      get().activeProjectId === id
        ? remaining
        : get().projects.filter((entry) => entry.id !== id);
    const nextId =
      get().activeProjectId === id ? nextProjects[0].id : get().activeProjectId;
    set({ projects: nextProjects, activeProjectId: nextId });
    const workspace = nextProjects.find((entry) => entry.id === nextId);
    if (workspace) get().selectPack(workspace.activePackId);
    persistWorkspaces(nextProjects, nextId);
    get().showToast("Project removed", "info");
  },

  renameProject: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const projects = get().projects.map((entry) =>
      entry.id === id ? { ...entry, name: trimmed, updatedAt: Date.now() } : entry,
    );
    set({ projects });
    persistWorkspaces(projects, get().activeProjectId);
  },

  importZip: async (file) => {
    try {
      const imported = await readProjectZip(file);
      const pack: Project = {
        id: newId("pack"),
        name: imported.name,
        versionId: imported.versionId,
        files: imported.files,
        activePath:
          Object.keys(imported.files).find((path) => path.endsWith(".mcfunction")) ??
          Object.keys(imported.files)[0] ??
          "",
        updatedAt: Date.now(),
      };
      const activeProjectId = get().activeProjectId;
      const workspace = get().projects.find((entry) => entry.id === activeProjectId);
      if (!workspace) return;
      const projects = get().projects.map((entry) =>
        entry.id === activeProjectId
          ? {
              ...entry,
              packs: [...entry.packs, pack],
              activePackId: pack.id,
              updatedAt: Date.now(),
            }
          : entry,
      );
      set({ projects });
      get().selectPack(pack.id);
      persistWorkspaces(projects, activeProjectId);
      get().showToast(`Imported ${file.name}`, "success");
    } catch (error) {
      get().showToast(`Import failed: ${(error as Error).message}`, "error");
    }
  },

  exportZip: () => {
    downloadProject(get().project);
    get().showToast("Pack exported as .zip", "success");
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
  setOpenPanels: (ids) => set({ openPanels: ids }),
  setPreferencesOpen: (open) => set({ preferencesOpen: open }),
  requestExplorerCreate: (request) =>
    set({
      explorerCreate: { ...request, nonce: Date.now() },
      panelRequest: { id: "explorer", nonce: Date.now() },
    }),
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

export function useActiveWorkspace(): WorkspaceProject | undefined {
  const projects = useWorkbench((state) => state.projects);
  const activeProjectId = useWorkbench((state) => state.activeProjectId);
  return projects.find((project) => project.id === activeProjectId) ?? projects[0];
}
