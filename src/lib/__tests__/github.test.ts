import { afterEach, describe, expect, it, vi } from "vitest";
import { importGithubDatapacks, parseGithubUrl } from "../github";

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function stubFetch(handler: FetchHandler) {
  const mock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      handler(urlOf(input), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function blob(path: string): { path: string; type: "blob" } {
  return { path, type: "blob" };
}

function treeResponse(paths: string[]) {
  return jsonResponse({
    truncated: false,
    tree: paths.map((path) => blob(path)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseGithubUrl", () => {
  it("parses repository roots", () => {
    expect(parseGithubUrl("https://github.com/acme/cool-pack")).toEqual({
      owner: "acme",
      repo: "cool-pack",
      branch: undefined,
      subpath: "",
    });
    expect(parseGithubUrl("https://github.com/acme/cool-pack/")).toEqual({
      owner: "acme",
      repo: "cool-pack",
      branch: undefined,
      subpath: "",
    });
  });

  it("parses tree branches and subpaths", () => {
    expect(parseGithubUrl("https://github.com/acme/cool-pack/tree/dev")).toEqual({
      owner: "acme",
      repo: "cool-pack",
      branch: "dev",
      subpath: "",
    });
    expect(
      parseGithubUrl("https://github.com/acme/cool-pack/tree/dev/packs/alpha/"),
    ).toEqual({
      owner: "acme",
      repo: "cool-pack",
      branch: "dev",
      subpath: "packs/alpha",
    });
  });

  it("accepts owner/repo shorthand and .git URLs", () => {
    expect(parseGithubUrl("acme/cool-pack")).toEqual({
      owner: "acme",
      repo: "cool-pack",
      branch: undefined,
      subpath: "",
    });
    expect(parseGithubUrl("https://github.com/acme/cool-pack.git/tree/dev")).toEqual({
      owner: "acme",
      repo: "cool-pack",
      branch: "dev",
      subpath: "",
    });
  });

  it("rejects unsupported links with a readable message", () => {
    expect(() => parseGithubUrl("https://github.com/acme")).toThrow(/Could not read/);
    expect(() =>
      parseGithubUrl("https://github.com/acme/cool-pack/blob/main/file.mcfunction"),
    ).toThrow(/Only repository roots/);
    expect(() => parseGithubUrl("https://gitlab.com/acme/cool-pack")).toThrow(/Unsupported/);
  });
});

describe("importGithubDatapacks", () => {
  it("resolves the default branch and imports a root datapack", async () => {
    const meta = JSON.stringify({ pack: { pack_format: 26, description: "Root pack" } });
    const functionBody = "say hello\n";
    const tagBody = JSON.stringify({ values: ["acme:hello"] });
    const functionPath = "data/acme/function/hello world.mcfunction";
    const functionUrl = `https://raw.githubusercontent.com/acme/cool-pack/main/${encodeURI(
      functionPath,
    )}`;

    const mock = stubFetch((url, init) => {
      if (url === "https://api.github.com/repos/acme/cool-pack") {
        expect(init?.headers).toMatchObject({ Accept: "application/vnd.github+json" });
        return jsonResponse({ default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/cool-pack/git/trees/main?recursive=1") {
        return treeResponse([
          "pack.mcmeta",
          functionPath,
          "data/acme/tags/function/load.json",
          "README.md",
          "screenshots/preview.png",
          ".gitignore",
        ]);
      }
      if (url === "https://raw.githubusercontent.com/acme/cool-pack/main/pack.mcmeta") {
        return textResponse(meta);
      }
      if (url === functionUrl) return textResponse(functionBody);
      if (
        url ===
        "https://raw.githubusercontent.com/acme/cool-pack/main/data/acme/tags/function/load.json"
      ) {
        return textResponse(tagBody);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await importGithubDatapacks("https://github.com/acme/cool-pack");

    expect(result.name).toBe("cool-pack");
    expect(result.url).toBe("https://github.com/acme/cool-pack");
    expect(result.packs).toHaveLength(1);

    const [pack] = result.packs;
    expect(pack.name).toBe("cool-pack");
    expect(pack.versionId).toBe("1.20.4");
    expect(Object.keys(pack.files)).toEqual([
      functionPath,
      "data/acme/tags/function/load.json",
      "pack.mcmeta",
    ]);
    expect(pack.files[functionPath]).toBe(functionBody);
    expect(pack.files["pack.mcmeta"]).toBe(meta);
    expect(mock).toHaveBeenCalledTimes(5);
    expect(mock.mock.calls.map(([input]) => urlOf(input))).not.toContain(
      "https://raw.githubusercontent.com/acme/cool-pack/main/README.md",
    );
  });

  it("imports a pack from a branch and subpath without resolving the default branch", async () => {
    const meta = JSON.stringify({
      pack: { min_format: [121, 0], max_format: [121, 0], description: "Alpha" },
    });
    const start = "say start\n";

    const mock = stubFetch((url) => {
      if (url === "https://api.github.com/repos/acme/maps/git/trees/dev?recursive=1") {
        return treeResponse([
          "datapacks/alpha/pack.mcmeta",
          "datapacks/alpha/data/alpha/function/start.mcfunction",
          "datapacks/alpha/notes.md",
          "datapacks/beta/pack.mcmeta",
        ]);
      }
      if (url === "https://raw.githubusercontent.com/acme/maps/dev/datapacks/alpha/pack.mcmeta") {
        return textResponse(meta);
      }
      if (
        url ===
        "https://raw.githubusercontent.com/acme/maps/dev/datapacks/alpha/data/alpha/function/start.mcfunction"
      ) {
        return textResponse(start);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await importGithubDatapacks(
      "https://github.com/acme/maps/tree/dev/datapacks/alpha",
    );

    expect(mock.mock.calls.map(([input]) => urlOf(input))).not.toContain(
      "https://api.github.com/repos/acme/maps",
    );
    expect(result.url).toBe("https://github.com/acme/maps/tree/dev/datapacks/alpha");
    expect(result.packs).toHaveLength(1);
    expect(result.packs[0].name).toBe("alpha");
    expect(result.packs[0].versionId).toBe("26.3");
    expect(result.packs[0].files).toEqual({
      "data/alpha/function/start.mcfunction": start,
      "pack.mcmeta": meta,
    });
  });

  it("splits nested packs and keeps their files out of the parent pack", async () => {
    const rootMeta = JSON.stringify({ pack: { pack_format: 26, description: "Root" } });
    const innerMeta = JSON.stringify({ pack: { pack_format: 15, description: "Inner" } });
    const rootFunction = "say root\n";
    const innerFunction = "say inner\n";
    const rootTag = JSON.stringify({ values: ["root:main"] });
    const innerTag = JSON.stringify({ values: ["inner:inner"] });

    const raw: Record<string, string> = {
      "https://raw.githubusercontent.com/acme/nested/main/pack.mcmeta": rootMeta,
      "https://raw.githubusercontent.com/acme/nested/main/data/root/function/main.mcfunction":
        rootFunction,
      "https://raw.githubusercontent.com/acme/nested/main/data/root/tags/function/load.json":
        rootTag,
      "https://raw.githubusercontent.com/acme/nested/main/data/bundled/inner/pack.mcmeta":
        innerMeta,
      "https://raw.githubusercontent.com/acme/nested/main/data/bundled/inner/data/inner/function/inner.mcfunction":
        innerFunction,
      "https://raw.githubusercontent.com/acme/nested/main/data/bundled/inner/data/inner/tags/function/load.json":
        innerTag,
    };

    stubFetch((url) => {
      if (url === "https://api.github.com/repos/acme/nested") {
        return jsonResponse({ default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/nested/git/trees/main?recursive=1") {
        return treeResponse([
          "pack.mcmeta",
          "data/root/function/main.mcfunction",
          "data/root/tags/function/load.json",
          "data/bundled/inner/pack.mcmeta",
          "data/bundled/inner/data/inner/function/inner.mcfunction",
          "data/bundled/inner/data/inner/tags/function/load.json",
          "data/bundled/inner/README.md",
        ]);
      }
      if (url in raw) return textResponse(raw[url]);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await importGithubDatapacks("https://github.com/acme/nested");

    expect(result.packs.map((pack) => pack.name)).toEqual(["nested", "inner"]);
    expect(result.packs[0].versionId).toBe("1.20.4");
    expect(result.packs[1].versionId).toBe("1.20");

    expect(result.packs[0].files).toEqual({
      "data/root/function/main.mcfunction": rootFunction,
      "data/root/tags/function/load.json": rootTag,
      "pack.mcmeta": rootMeta,
    });
    expect(result.packs[1].files).toEqual({
      "data/inner/function/inner.mcfunction": innerFunction,
      "data/inner/tags/function/load.json": innerTag,
      "pack.mcmeta": innerMeta,
    });
    expect(Object.keys(result.packs[0].files).some((path) => path.includes("inner"))).toBe(
      false,
    );
  });

  it("falls back to 26.3 when the pack format is unknown", async () => {
    const meta = JSON.stringify({ pack: { pack_format: 999, description: "Unknown" } });
    const content = "say fallback\n";

    stubFetch((url) => {
      if (url === "https://api.github.com/repos/acme/future") {
        return jsonResponse({ default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/future/git/trees/main?recursive=1") {
        return treeResponse(["pack.mcmeta", "data/future/function/main.mcfunction"]);
      }
      if (url === "https://raw.githubusercontent.com/acme/future/main/pack.mcmeta") {
        return textResponse(meta);
      }
      if (
        url ===
        "https://raw.githubusercontent.com/acme/future/main/data/future/function/main.mcfunction"
      ) {
        return textResponse(content);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await importGithubDatapacks("https://github.com/acme/future");

    expect(result.packs[0].versionId).toBe("26.3");
  });

  it("fails with a useful error when the repository has no datapack", async () => {
    const mock = stubFetch((url) => {
      if (url === "https://api.github.com/repos/acme/empty") {
        return jsonResponse({ default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/empty/git/trees/main?recursive=1") {
        return treeResponse(["README.md", "data/acme/function/run.mcfunction"]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(importGithubDatapacks("https://github.com/acme/empty")).rejects.toThrow(
      /No datapack found in "acme\/empty".*at ref "main"/,
    );
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("reports GitHub rate limits readably", async () => {
    const mock = stubFetch((url) => {
      if (url === "https://api.github.com/repos/acme/limited") {
        return jsonResponse(
          { message: "API rate limit exceeded" },
          403,
          {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1700000000",
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(importGithubDatapacks("https://github.com/acme/limited")).rejects.toThrow(
      /rate limit exceeded.*Try again after 2023-11-14/i,
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing repository readably", async () => {
    stubFetch((url) => {
      if (url === "https://api.github.com/repos/acme/private") {
        return jsonResponse({ message: "Not Found" }, 404);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(importGithubDatapacks("https://github.com/acme/private")).rejects.toThrow(
      /was not found \(HTTP 404\)/,
    );
  });

  it("limits raw downloads to six concurrent requests", async () => {
    let active = 0;
    let maximum = 0;
    const paths = Array.from({ length: 12 }, (_, index) => `data/acme/function/f${index}.mcfunction`);
    const treePaths = ["pack.mcmeta", ...paths];

    stubFetch(async (url) => {
      if (url === "https://api.github.com/repos/acme/many") {
        return jsonResponse({ default_branch: "main" });
      }
      if (url === "https://api.github.com/repos/acme/many/git/trees/main?recursive=1") {
        return treeResponse(treePaths);
      }
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return textResponse("say hi\n");
    });

    const result = await importGithubDatapacks("https://github.com/acme/many");

    expect(result.packs[0].files).toHaveProperty("pack.mcmeta");
    expect(Object.keys(result.packs[0].files)).toHaveLength(treePaths.length);
    expect(maximum).toBeLessThanOrEqual(6);
  });
});
