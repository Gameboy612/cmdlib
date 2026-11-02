import { describe, it, expect } from "vitest";
import { zipSync } from "fflate";
import { readProjectArchiveBytes } from "../io";
describe("large archive", () => {
  it("imports over ten thousand files quickly", () => {
    const entries: Record<string, Uint8Array> = {};
    entries["pack.mcmeta"] = new TextEncoder().encode(JSON.stringify({pack:{pack_format:20,supported_formats:{min_inclusive:20,max_inclusive:57}}}));
    for (let i=0;i<13566;i++) entries[`data/big/function/f${i}.mcfunction`] = new TextEncoder().encode(`# ${i}\n`);
    const zip = zipSync(entries);
    const started = Date.now();
    const result = readProjectArchiveBytes(zip, "big.zip");
    console.log("MS", Date.now()-started, "files", Object.keys(result.packs[0].files).length);
    expect(result.packs[0].files["data/big/function/f13565.mcfunction"]).toBeDefined();
  }, 30000);
});
