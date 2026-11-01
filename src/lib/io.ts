import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Project } from "./mc/datapack";
import { createProject } from "./mc/datapack";
import { VERSIONS, buildPackMeta, getVersion } from "./mc/version";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadProject(project: Project): void {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(project.files)) {
    entries[path] = strToU8(content);
  }
  const zip = zipSync(entries, { level: 6 });
  const safeName = project.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "datapack";
  downloadBlob(new Blob([zip], { type: "application/zip" }), `${safeName}.zip`);
}

const MAX_ARCHIVE_FILES = 10_000;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

function assertArchiveLimits(entries: Record<string, Uint8Array>): void {
  const paths = Object.keys(entries);
  if (paths.length > MAX_ARCHIVE_FILES) {
    throw new Error(
      `That zip contains ${paths.length.toLocaleString()} files; the limit is ${MAX_ARCHIVE_FILES.toLocaleString()}.`,
    );
  }
  let total = 0;
  for (const data of Object.values(entries)) total += data.byteLength;
  if (total > MAX_ARCHIVE_BYTES) {
    throw new Error(
      `That zip expands to ${(total / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB.`,
    );
  }
}

export interface ImportedProject {
  name: string;
  files: Record<string, string>;
  versionId: string;
}

export async function readProjectZip(file: File): Promise<ImportedProject> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const unzipped = unzipSync(buffer);
  assertArchiveLimits(unzipped);
  const files: Record<string, string> = {};
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue;
    if (path.includes("__MACOSX")) continue;
    if (!path.endsWith(".mcfunction") && !path.endsWith(".json") && !path.endsWith(".mcmeta")) continue;
    // Some zips have a wrapping folder; strip the first segment if the pack
    // metadata is not at the root.
    files[path] = strFromU8(data);
  }
  const normalized = stripWrapper(files);
  const versionId = detectVersion(normalized);
  return {
    name: file.name.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim() || "Imported pack",
    files: normalized,
    versionId,
  };
}

export interface ImportedProjectArchive {
  name: string;
  packs: ImportedProject[];
}

/**
 * Read a project archive containing one or more datapacks. Every directory
 * with a `pack.mcmeta` becomes a pack; nested packs are split out of their
 * parent. This is the local counterpart to a GitHub project import.
 */
export function readProjectArchiveBytes(
  buffer: Uint8Array,
  archiveName: string,
): ImportedProjectArchive {
  const unzipped = unzipSync(buffer);
  assertArchiveLimits(unzipped);
  const files: Record<string, string> = {};
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/") || path.includes("__MACOSX")) continue;
    if (
      !path.endsWith(".mcfunction") &&
      !path.endsWith(".json") &&
      !path.endsWith(".mcmeta")
    ) {
      continue;
    }
    files[path.replace(/^\/+/, "")] = strFromU8(data);
  }

  const roots = Object.keys(files)
    .filter((path) => path === "pack.mcmeta" || path.endsWith("/pack.mcmeta"))
    .map((path) => path.slice(0, -"pack.mcmeta".length))
    .sort((a, b) => a.length - b.length);

  if (roots.length === 0) {
    throw new Error("No pack.mcmeta was found in that zip");
  }

  const projectName =
    archiveName.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim() ||
    "Imported project";

  const packFiles: Array<Record<string, string>> = roots.map(() => ({}));
  for (const [path, content] of Object.entries(files)) {
    let owner = -1;
    for (let index = 0; index < roots.length; index++) {
      const root = roots[index];
      if (root === "" || path.startsWith(root)) owner = index;
    }
    if (owner < 0) continue;
    const root = roots[owner];
    const relative = root ? path.slice(root.length) : path;
    if (!relative) continue;
    packFiles[owner][relative] = content;
  }

  const packs = roots.flatMap((root, index) => {
    const contents = packFiles[index];
    if (!contents["pack.mcmeta"]) return [];
    const fallbackName = root
      ? root.replace(/\/$/, "").split("/").pop() || projectName
      : projectName;
    return [
      {
        name: fallbackName.replace(/[-_]+/g, " ").trim() || `Pack ${index + 1}`,
        files: contents,
        versionId: detectVersion(contents),
      },
    ];
  });

  if (packs.length === 0) {
    throw new Error("The zip did not contain a readable datapack");
  }
  return { name: projectName, packs };
}

export async function readProjectArchive(file: File): Promise<ImportedProjectArchive> {
  return readProjectArchiveBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

function stripWrapper(files: Record<string, string>): Record<string, string> {
  if (files["pack.mcmeta"]) return files;
  const wrapper = Object.keys(files).find((path) => path.endsWith("/pack.mcmeta"));
  if (!wrapper) return files;
  const prefix = wrapper.slice(0, wrapper.length - "pack.mcmeta".length);
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith(prefix)) continue;
    out[path.slice(prefix.length)] = content;
  }
  return out;
}

export function detectVersion(files: Record<string, string>): string {
  const meta = files["pack.mcmeta"];
  if (meta) {
    try {
      const parsed = JSON.parse(meta) as {
        pack?: { pack_format?: number; min_format?: number | number[] };
      };
      const raw = parsed.pack?.min_format ?? parsed.pack?.pack_format;
      const major = Array.isArray(raw) ? raw[0] : raw;
      if (typeof major === "number") {
        // Prefer an exact major match, newest first.
        const match = VERSIONS.find((v) => v.packFormat[0] === major);
        if (match) return match.id;
      }
    } catch {
      // Fall through to folder detection.
    }
  }
  if (Object.keys(files).some((path) => /\/functions\//.test(path))) {
    return "1.20.4";
  }
  return "26.3";
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

export function ensurePackMeta(project: Project): Project {
  const version = getVersion(project.versionId);
  if (project.files["pack.mcmeta"]) return project;
  return {
    ...project,
    files: {
      ...project.files,
      "pack.mcmeta": buildPackMeta(version, project.name) + "\n",
    },
  };
}

export function emptyProject(name = "Untitled Pack", versionId = "26.3"): Project {
  return createProject(versionId, name);
}
