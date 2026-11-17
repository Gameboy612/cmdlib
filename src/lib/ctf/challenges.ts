import { fetchGithubRepositoryFiles } from "../github";

export interface CtfChallengeSource {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  repoUrl: string;
  hint: string;
}

export interface CtfChallenge extends CtfChallengeSource {
  /** Files the player is allowed to inspect. */
  publicFiles: Record<string, string>;
  /** Server-side files loaded into the simulator; never shown in the UI. */
  serverFiles: Record<string, string>;
  /** Expected flag, read from .secret/flag.txt. */
  flag: string;
  /** Secret flag file path, never shown in the project tree. */
  flagPath: string;
  /** Raw contents of the flag file used to resolve `flag`. */
  flagFileContent?: string;
}

/** Challenge metadata only; files are fetched from the linked repository. */
export const CTF_CHALLENGES: CtfChallengeSource[] = [
  {
    id: "cuhkctf26-lab1",
    title: "CUHKCTF26 Workshop Lab 1",
    description:
      "Reverse engineer the sqrt machine and recover the flag. You only get the public datapack and player commands.",
    category: "Reverse Engineering",
    difficulty: "1 / 5",
    repoUrl: "https://github.com/Gameboy612/CUHKCTF26-Workshop-CMDLab1",
    hint: "Use /trigger input set <value>, then run the timeline.",
  },
  {
    id: "cuhkctf26-lab2",
    title: "CUHKCTF26 Workshop Lab 2",
    description:
      "A macro-injection challenge. Inspect the public pack and find a creative item payload that leaks the flag.",
    category: "Reverse Engineering · Macro Injection",
    difficulty: "2 / 5",
    repoUrl: "https://github.com/Gameboy612/CUHKCTF26-Workshop-CMDLab2",
    hint: "The server puts you in creative mode. Give yourself an item with custom_data and run the timeline.",
  },
];

export function getCtfChallengeSource(id: string): CtfChallengeSource | undefined {
  return CTF_CHALLENGES.find((challenge) => challenge.id === id);
}

export const DEFAULT_CTF_CHALLENGE = CTF_CHALLENGES[0];

function publicFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith("public/")) out[path.slice("public/".length)] = content;
  }
  return out;
}

function serverFiles(files: Record<string, string>): Record<string, string> {
  const roots = Object.keys(files)
    .filter((path) => path.startsWith(".secret/") && path.endsWith("/pack.mcmeta"))
    .map((path) => path.slice(0, -"pack.mcmeta".length))
    .sort((a, b) => a.length - b.length);
  const root = roots[0];
  if (!root) return {};
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith(root)) out[path.slice(root.length)] = content;
  }
  return out;
}

function flagFromFiles(files: Record<string, string>): {
  flag: string;
  path: string;
} {
  const direct = files[".secret/flag.txt"];
  if (direct !== undefined) return { flag: direct.trim(), path: ".secret/flag.txt" };
  const matchingPath = Object.keys(files).find(
    (path) => path.startsWith(".secret/") && path.endsWith("/flag.txt"),
  );
  if (matchingPath) {
    return { flag: (files[matchingPath] ?? "").trim(), path: matchingPath };
  }
  return { flag: "", path: ".secret/flag.txt" };
}

const CTF_CACHE_KEY = "cmdlib:ctf-cache:v1";
const CTF_CACHE_MAX_AGE = 10 * 60 * 1000;
const challengeCache = new Map<string, { at: number; challenge: CtfChallenge }>();

function readCachedChallenge(id: string): CtfChallenge | null {
  const memory = challengeCache.get(id);
  if (memory && Date.now() - memory.at < CTF_CACHE_MAX_AGE) return memory.challenge;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CTF_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { at: number; challenge: CtfChallenge }>;
    const cached = parsed[id];
    if (!cached || Date.now() - cached.at > CTF_CACHE_MAX_AGE) return null;
    challengeCache.set(id, cached);
    return cached.challenge;
  } catch {
    return null;
  }
}

function writeCachedChallenge(id: string, challenge: CtfChallenge): void {
  const entry = { at: Date.now(), challenge };
  challengeCache.set(id, entry);
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(CTF_CACHE_KEY);
    const parsed: Record<string, { at: number; challenge: CtfChallenge }> = raw
      ? JSON.parse(raw)
      : {};
    parsed[id] = entry;
    window.sessionStorage.setItem(CTF_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Session storage is only a convenience cache.
  }
}

/** Pull a challenge's public files, server pack and flag from its repository. */
export async function fetchCtfChallenge(id: string): Promise<CtfChallenge> {
  const source = getCtfChallengeSource(id);
  if (!source) throw new Error(`Unknown challenge '${id}'`);
  const cached = readCachedChallenge(id);
  if (cached) return cached;
  let repo;
  try {
    repo = await fetchGithubRepositoryFiles(
      source.repoUrl,
      (path) => path.startsWith("public/") || path.startsWith(".secret/"),
    );
  } catch (error) {
    // GitHub can transiently rate-limit the tree or raw requests. Retry once
    // before surfacing the failure to the challenge page.
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      repo = await fetchGithubRepositoryFiles(
        source.repoUrl,
        (path) => path.startsWith("public/") || path.startsWith(".secret/"),
      );
    } catch {
      if (cached) return cached;
      throw error;
    }
  }
  const pub = publicFiles(repo.files);
  const server = serverFiles(repo.files);
  if (Object.keys(pub).length === 0) {
    throw new Error(`Challenge '${source.title}' has no public files`);
  }
  if (Object.keys(server).length === 0) {
    throw new Error(`Challenge '${source.title}' has no server datapack`);
  }
  const flag = flagFromFiles(repo.files);
  const challenge: CtfChallenge = {
    ...source,
    repoUrl: repo.url,
    publicFiles: pub,
    serverFiles: server,
    flag: flag.flag,
    flagPath: flag.path,
    flagFileContent: flag.flag,
  };
  writeCachedChallenge(id, challenge);
  return challenge;
}
