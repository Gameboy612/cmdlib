import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readProjectArchiveBytes } from "../io";

function archive(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content);
  }
  return zipSync(entries);
}

describe("project archive import", () => {
  it("finds multiple packs in one zip", () => {
    const data = archive({
      "packs/one/pack.mcmeta": '{"pack":{"pack_format":121,"description":"one"}}',
      "packs/one/data/one/function/load.mcfunction": "say one\n",
      "packs/two/pack.mcmeta": '{"pack":{"pack_format":121,"description":"two"}}',
      "packs/two/data/two/function/load.mcfunction": "say two\n",
      "README.md": "ignored",
    });
    const result = readProjectArchiveBytes(data, "my-project.zip");
    expect(result.name).toBe("my project");
    expect(result.packs).toHaveLength(2);
    expect(result.packs.map((pack) => pack.name)).toEqual(["one", "two"]);
    expect(result.packs[0].files["data/one/function/load.mcfunction"]).toContain("one");
  });

  it("keeps nested packs out of their parent pack", () => {
    const data = archive({
      "pack.mcmeta": '{"pack":{"pack_format":121,"description":"root"}}',
      "data/root/function/load.mcfunction": "say root\n",
      "nested/pack.mcmeta": '{"pack":{"pack_format":121,"description":"nested"}}',
      "nested/data/nested/function/load.mcfunction": "say nested\n",
    });
    const result = readProjectArchiveBytes(data, "archive.zip");
    expect(result.packs).toHaveLength(2);
    const root = result.packs.find((pack) => pack.name === "archive")!;
    const nested = result.packs.find((pack) => pack.name === "nested")!;
    expect(root.files["data/root/function/load.mcfunction"]).toContain("root");
    expect(root.files["nested/pack.mcmeta"]).toBeUndefined();
    expect(nested.files["data/nested/function/load.mcfunction"]).toContain("nested");
  });

  it("rejects a zip without pack.mcmeta", () => {
    expect(() =>
      readProjectArchiveBytes(archive({ "README.md": "nothing" }), "bad.zip"),
    ).toThrow(/pack\.mcmeta/);
  });
});
