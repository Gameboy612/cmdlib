import { createProject, type Project } from "./mc/datapack";
import { newId } from "./ids";

/** A project groups one or more datapacks (packs). */
export interface WorkspaceProject {
  id: string;
  name: string;
  packs: Project[];
  activePackId: string;
  githubUrl?: string;
  updatedAt: number;
}

export function createWorkspace(
  name = "Untitled Project",
  versionId = "26.3",
  packName = "Untitled Pack",
): WorkspaceProject {
  const pack = createProject(versionId, packName);
  return {
    id: newId("project"),
    name,
    packs: [pack],
    activePackId: pack.id,
    updatedAt: Date.now(),
  };
}

export function activePackOf(project: WorkspaceProject): Project {
  return (
    project.packs.find((pack) => pack.id === project.activePackId) ??
    project.packs[0] ??
    createProject("26.3")
  );
}

export function updatePackInProject(
  project: WorkspaceProject,
  pack: Project,
): WorkspaceProject {
  const exists = project.packs.some((entry) => entry.id === pack.id);
  return {
    ...project,
    packs: exists
      ? project.packs.map((entry) => (entry.id === pack.id ? pack : entry))
      : [...project.packs, pack],
    activePackId: pack.id,
    updatedAt: Date.now(),
  };
}

export function uniquePackName(project: WorkspaceProject): string {
  let index = project.packs.length + 1;
  let name = `Pack ${index}`;
  const names = new Set(project.packs.map((pack) => pack.name));
  while (names.has(name)) {
    index += 1;
    name = `Pack ${index}`;
  }
  return name;
}

export function uniqueProjectName(projects: WorkspaceProject[]): string {
  let index = projects.length + 1;
  let name = `Project ${index}`;
  const names = new Set(projects.map((project) => project.name));
  while (names.has(name)) {
    index += 1;
    name = `Project ${index}`;
  }
  return name;
}
