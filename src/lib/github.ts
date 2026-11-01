import { detectVersion } from "./io";

/** A single datapack discovered inside a GitHub repository. */
export interface ImportedPack {
  name: string;
  versionId: string;
  files: Record<string, string>;
}

/** Result of importing every datapack from a GitHub repository URL. */
export interface GithubImport {
  name: string;
  url: string;
  packs: ImportedPack[];
}

/**
 * A GitHub repository URL split into the pieces the importer needs.
 *
 * `branch` is only set for `/tree/<branch>` URLs. When it is missing the
 * repository's default branch is resolved through the GitHub API.
 */
export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  branch?: string;
  /** Repository-relative directory to scan. Empty scans the whole repository. */
  subpath: string;
}

interface TreeEntry {
  path: string;
  type: string;
}

interface PackSelection {
  /** Repository-relative directory that contains `pack.mcmeta`. */
  root: string;
  /** File paths relative to `root`, sorted for deterministic output. */
  paths: string[];
}

interface FileTask {
  packIndex: number;
  relativePath: string;
  repoPath: string;
}

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const GITHUB_WEB = "https://github.com";
const API_ACCEPT = "application/vnd.github+json";
const MAX_CONCURRENCY = 6;
const PACK_META = "pack.mcmeta";
const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Import every datapack found in a GitHub repository.
 *
 * Supported URLs:
 * - `https://github.com/owner/repo`
 * - `https://github.com/owner/repo/tree/<branch>`
 * - `https://github.com/owner/repo/tree/<branch>/<subpath>`
 * - `owner/repo` shorthand (and the `/tree/...` variants of it)
 *
 * Each directory containing a `pack.mcmeta` is imported as a separate pack.
 * Nested packs are removed from their parent's file map. If no datapack is
 * found the promise rejects with a descriptive error.
 */
export async function importGithubDatapacks(url: string): Promise<GithubImport> {
  const parsed = parseGithubUrl(url);
  const ref = parsed.branch ?? (await resolveDefaultBranch(parsed));
  const entries = await fetchRepositoryTree(parsed, ref);
  const selections = discoverPacks(entries, parsed.subpath);

  if (selections.length === 0) {
    throw noDatapackError(parsed, ref);
  }

  const contentsByPack: Array<Record<string, string>> = selections.map(() => ({}));
  const tasks: FileTask[] = [];
  selections.forEach((selection, packIndex) => {
    selection.paths.forEach((relativePath) => {
      tasks.push({
        packIndex,
        relativePath,
        repoPath: selection.root ? `${selection.root}/${relativePath}` : relativePath,
      });
    });
  });

  // Fetch every file through one shared pool so a repository with several
  // packs still keeps at most MAX_CONCURRENCY requests in flight.
  await runConcurrently(tasks, MAX_CONCURRENCY, async (task) => {
    const content = await fetchRawFile(parsed, ref, task.repoPath);
    contentsByPack[task.packIndex][task.relativePath] = content;
  });

  const packs = selections.map((selection, index) => {
    const fetched = contentsByPack[index];
    // Rebuild in sorted order; concurrent responses otherwise decide key order.
    const files: Record<string, string> = {};
    for (const relativePath of selection.paths) {
      files[relativePath] = fetched[relativePath];
    }
    return {
      name: packName(selection.root, parsed.repo),
      versionId: detectVersion(files),
      files,
    } satisfies ImportedPack;
  });

  return {
    name: parsed.repo,
    url: sourceUrl(parsed, ref),
    packs,
  };
}

/** Parse a supported GitHub URL into owner, repository, branch and subpath. */
export function parseGithubUrl(rawUrl: string): ParsedGithubUrl {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new Error("A GitHub repository URL is required.");
  }

  const cleaned = rawUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const fullMatch = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(cleaned);
  let path: string;

  if (fullMatch) {
    path = fullMatch[1];
  } else if (/^[^/\s]+\/[^/\s]+(?:\/.*)?$/.test(cleaned)) {
    // owner/repo shorthand, optionally followed by /tree/<branch>/<subpath>.
    path = cleaned;
  } else {
    throw new Error(
      `Unsupported GitHub URL "${rawUrl}". Expected "https://github.com/owner/repo", ` +
        `"https://github.com/owner/repo/tree/<branch>" (optionally followed by a subpath), ` +
        `or the "owner/repo" shorthand.`,
    );
  }

  const parts = path.split("/").filter((part) => part !== "");
  const owner = decodeSegment(parts[0] ?? "");
  const repo = decodeSegment(parts[1] ?? "").replace(/\.git$/i, "");

  if (
    !owner ||
    !repo ||
    owner === "." ||
    owner === ".." ||
    repo === "." ||
    repo === ".." ||
    !NAME_PATTERN.test(owner) ||
    !NAME_PATTERN.test(repo)
  ) {
    throw new Error(
      `Could not read a GitHub owner and repository from "${rawUrl}". ` +
        `Expected "https://github.com/owner/repo".`,
    );
  }

  let branch: string | undefined;
  let subpath = "";
  const rest = parts.slice(2);

  if (rest.length > 0) {
    if (rest[0] !== "tree") {
      throw new Error(
        `Unsupported GitHub URL path "/${rest.join("/")}" in "${rawUrl}". ` +
          `Only repository roots and /tree/<branch>[/<subpath>] links are supported.`,
      );
    }
    if (!rest[1]) {
      throw new Error(
        `GitHub URL "${rawUrl}" is missing a branch name. ` +
          `Expected "https://github.com/owner/repo/tree/<branch>".`,
      );
    }
    branch = decodeSegment(rest[1]);
    if (!branch) {
      throw new Error(`GitHub URL "${rawUrl}" contains an empty branch name.`);
    }
    subpath = rest.slice(2).map(decodeSegment).join("/").replace(/^\/+|\/+$/g, "");
  }

  return { owner, repo, branch, subpath };
}

async function resolveDefaultBranch(parsed: ParsedGithubUrl): Promise<string> {
  const label = `repository "${parsed.owner}/${parsed.repo}"`;
  const url = `${GITHUB_API}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const response = await fetchWithContext(url, { headers: { Accept: API_ACCEPT } }, label);
  const payload = await readJson(
    response,
    label,
    `GitHub repository "${parsed.owner}/${parsed.repo}" was not found (HTTP 404). ` +
      `Check the spelling and make sure the repository is public.`,
  );
  const branch = isRecord(payload) ? payload.default_branch : undefined;
  if (typeof branch !== "string" || branch.trim() === "") {
    throw new Error(
      `GitHub did not report a default branch for "${parsed.owner}/${parsed.repo}". ` +
        `Append /tree/<branch> to the URL to select a branch explicitly.`,
    );
  }
  return branch;
}

async function fetchRepositoryTree(parsed: ParsedGithubUrl, ref: string): Promise<TreeEntry[]> {
  const label = `the file tree of "${parsed.owner}/${parsed.repo}" at "${ref}"`;
  const url =
    `${GITHUB_API}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}` +
    `/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const response = await fetchWithContext(url, { headers: { Accept: API_ACCEPT } }, label);
  const payload = await readJson(
    response,
    label,
    `GitHub could not find branch or ref "${ref}" in "${parsed.owner}/${parsed.repo}" (HTTP 404). ` +
      `Check the branch name in the URL, or omit /tree/<branch> to use the default branch.`,
  );

  if (!isRecord(payload)) {
    throw new Error(`GitHub returned an unexpected response while reading ${label}.`);
  }
  if (!Array.isArray(payload.tree)) {
    throw new Error(`GitHub did not return a file tree for ${label}.`);
  }
  if (payload.truncated === true) {
    throw new Error(
      `GitHub truncated the file tree for "${parsed.owner}/${parsed.repo}" at "${ref}". ` +
        `The repository is too large to scan in one request; import a narrower /tree/<branch>/<subpath> URL.`,
    );
  }

  const tree: unknown[] = payload.tree;
  const entries: TreeEntry[] = [];
  for (const value of tree) {
    if (!isRecord(value) || typeof value.path !== "string") continue;
    entries.push({
      path: value.path,
      type: typeof value.type === "string" ? value.type : "",
    });
  }
  return entries;
}

/**
 * Group blob paths by the deepest ancestor directory that has a pack.mcmeta.
 * Assigning each file to its deepest pack root is what keeps nested packs out
 * of their parent pack, including the nested pack's own pack.mcmeta.
 */
function discoverPacks(entries: readonly TreeEntry[], rawSubpath: string): PackSelection[] {
  const scope = rawSubpath.replace(/^\/+|\/+$/g, "");
  const blobs: string[] = [];

  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    const path = entry.path.replace(/^\/+|\/+$/g, "");
    if (!path || hasIgnoredSegment(path)) continue;
    if (!isWithinScope(path, scope)) continue;
    blobs.push(path);
  }

  const roots = [
    ...new Set(blobs.filter((path) => baseName(path) === PACK_META).map((path) => dirName(path))),
  ].sort(comparePackRoots);

  if (roots.length === 0) return [];

  const filesByRoot = new Map<string, string[]>(roots.map((root) => [root, []]));
  for (const path of blobs) {
    const root = deepestRoot(path, roots);
    if (root === undefined) continue;
    const relative = root === "" ? path : path.slice(root.length + 1);
    if (!isPackFile(relative)) continue;
    filesByRoot.get(root)?.push(relative);
  }

  return roots.map((root) => ({
    root,
    paths: (filesByRoot.get(root) ?? []).sort(),
  }));
}

function deepestRoot(path: string, roots: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const root of roots) {
    if (root !== "" && path !== root && !path.startsWith(`${root}/`)) continue;
    if (best === undefined || root.length > best.length) best = root;
  }
  return best;
}

function isPackFile(relativePath: string): boolean {
  return relativePath === PACK_META || relativePath.startsWith("data/");
}

function isWithinScope(path: string, scope: string): boolean {
  return scope === "" || path === scope || path.startsWith(`${scope}/`);
}

function hasIgnoredSegment(path: string): boolean {
  return path.split("/").some((segment) => segment === ".git" || segment === "__MACOSX");
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function dirName(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function comparePackRoots(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "") return -1;
  if (b === "") return 1;
  return a < b ? -1 : 1;
}

function packName(root: string, repo: string): string {
  if (!root) return repo;
  const name = baseName(root);
  return name || repo;
}

async function fetchRawFile(
  parsed: ParsedGithubUrl,
  ref: string,
  repoPath: string,
): Promise<string> {
  const url = rawFileUrl(parsed, ref, repoPath);
  const label = `file "${repoPath}" from "${parsed.owner}/${parsed.repo}" at "${ref}"`;
  const response = await fetchWithContext(url, undefined, label);

  if (!response.ok) {
    const body = await responseText(response);
    if (isRateLimited(response, body)) {
      throw new Error(rateLimitError(label, response));
    }
    if (response.status === 404) {
      throw new Error(
        `Could not download "${repoPath}" from "${parsed.owner}/${parsed.repo}" at "${ref}" (HTTP 404). ` +
          `The file may have been removed, or the branch or path may be wrong.`,
      );
    }
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `Could not download "${repoPath}" from "${parsed.owner}/${parsed.repo}" at "${ref}" ` +
        `(HTTP ${response.status}${statusText}).`,
    );
  }

  try {
    return await response.text();
  } catch (error) {
    throw new Error(`Could not read ${label} as text: ${errorMessage(error)}`);
  }
}

function rawFileUrl(parsed: ParsedGithubUrl, ref: string, repoPath: string): string {
  return (
    `${GITHUB_RAW}/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/` +
    `${encodeURIComponent(ref)}/${encodePath(repoPath)}`
  );
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function repoUrl(parsed: ParsedGithubUrl): string {
  return `${GITHUB_WEB}/${parsed.owner}/${parsed.repo}`;
}

/** Canonical link to the imported location, including branch and subpath. */
function sourceUrl(parsed: ParsedGithubUrl, ref: string): string {
  if (!parsed.branch && !parsed.subpath) return repoUrl(parsed);
  const subpath = parsed.subpath ? `/${encodePath(parsed.subpath)}` : "";
  return `${repoUrl(parsed)}/tree/${encodePath(ref)}${subpath}`;
}

function noDatapackError(parsed: ParsedGithubUrl, ref: string): Error {
  const where = parsed.subpath ? ` under "${parsed.subpath}"` : "";
  return new Error(
    `No datapack found in "${parsed.owner}/${parsed.repo}"${where} at ref "${ref}". ` +
      `A datapack directory must contain a "${PACK_META}" file at its root; ` +
      `the repository root itself can also be a datapack.`,
  );
}

async function fetchWithContext(
  url: string,
  init: RequestInit | undefined,
  label: string,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(
      `Could not reach GitHub while fetching ${label}. ` +
        `Check your network connection and try again. (${errorMessage(error)})`,
    );
  }
}

async function readJson(
  response: Response,
  label: string,
  notFoundMessage?: string,
): Promise<unknown> {
  if (!response.ok) {
    const body = await responseText(response);
    if (isRateLimited(response, body)) {
      throw new Error(rateLimitError(label, response));
    }
    if (response.status === 404 && notFoundMessage) {
      throw new Error(notFoundMessage);
    }
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `GitHub request for ${label} failed with HTTP ${response.status}${statusText}.` +
        apiMessage(body),
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error(`GitHub returned an invalid JSON response for ${label}.`);
  }
}

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function isRateLimited(response: Response, body: string): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  const remaining = headerValue(response, "x-ratelimit-remaining");
  return remaining === "0" || /rate limit/i.test(body);
}

function rateLimitError(label: string, response: Response): string {
  const reset = headerValue(response, "x-ratelimit-reset");
  const resetSeconds = reset && /^\d+$/.test(reset) ? Number(reset) : Number.NaN;
  const resetDate =
    Number.isFinite(resetSeconds) && resetSeconds > 0
      ? new Date(resetSeconds * 1000)
      : null;
  const when =
    resetDate && !Number.isNaN(resetDate.getTime())
      ? ` after ${resetDate.toISOString()}`
      : " later";
  return (
    `GitHub rate limit exceeded while reading ${label}. Try again${when}. ` +
    `Unauthenticated GitHub requests are limited to 60 per hour; ` +
    `waiting or using a /tree/<branch>/<subpath> URL may help.`
  );
}

function headerValue(response: Response, name: string): string | null {
  try {
    return response.headers.get(name);
  } catch {
    return null;
  }
}

function apiMessage(body: string): string {
  if (!body) return "";
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && typeof parsed.message === "string" && parsed.message.trim() !== "") {
      const message =
        parsed.message.length > 300 ? `${parsed.message.slice(0, 300)}…` : parsed.message;
      return ` GitHub said: ${message.trim()}`;
    }
  } catch {
    // The body was not JSON (GitHub sometimes returns HTML error pages).
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Run `task` over every item with at most `limit` promises in flight. */
async function runConcurrently<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      await task(item);
    }
  });
  await Promise.all(workers);
}
