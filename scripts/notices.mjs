import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = Object.keys(pkg.dependencies ?? {}).sort();
const lines = [];
lines.push("cmdlib — third-party notices");
lines.push("=====================================");
lines.push("");
lines.push("This file lists the runtime dependencies bundled into the cmdlib static site,");
lines.push("their licenses, and the full license text where the package ships one.");
lines.push("");
lines.push(`Generated: 2026-11-01 · ${deps.length} direct runtime dependencies`);
lines.push("");

for (const dep of deps) {
  const dir = join("node_modules", dep);
  if (!existsSync(dir)) continue;
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch {}
  lines.push("-".repeat(72));
  lines.push(`${dep}@${meta.version ?? "?"} — ${meta.license ?? "license not declared"}`);
  if (meta.homepage) lines.push(meta.homepage);
  lines.push("");
  const candidates = readdirSync(dir).filter((f) => /^(LICEN[CS]E|COPYING)/i.test(f));
  if (candidates.length === 0) {
    lines.push("(No license file was shipped in the package; see the package metadata.)");
  } else {
    for (const file of candidates) {
      lines.push(readFileSync(join(dir, file), "utf8").trim());
      lines.push("");
    }
  }
  lines.push("");
}

lines.push("=".repeat(72));
lines.push("Fonts");
lines.push("Bricolage Grotesque — SIL Open Font License 1.1 — /public/fonts/OFL-BricolageGrotesque.txt");
lines.push("JetBrains Mono — SIL Open Font License 1.1 — /public/fonts/OFL-JetBrainsMono.txt");
lines.push("");
lines.push("Build-only tools (not shipped to the browser):");
lines.push("- sharp (Apache-2.0) — renders the social card from public/og.svg.");
lines.push("- playwright-core (Apache-2.0) — development-time visual verification only.");
lines.push("");
lines.push("No GPL, AGPL, SSPL or non-commercial-only code is bundled in the shipping site.");
lines.push("See /credits/ for the full attribution and commercial-use audit.");

writeFileSync("public/THIRD_PARTY_NOTICES.txt", lines.join("\n"));
console.log("wrote public/THIRD_PARTY_NOTICES.txt");
