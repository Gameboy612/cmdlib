"use client";

import { Reveal } from "@/components/ui/Reveal";
import { formatPackFormat, getVersion } from "@/lib/mc/version";
import styles from "./landing.module.css";

const MILESTONES = [
  { id: "1.13", label: "The command era", note: "Initial pack format 4." },
  { id: "1.16.5", label: "Nether update", note: "Format 6." },
  { id: "1.20.2", label: "Macros arrive", note: "Function macros land." },
  { id: "1.21", label: "Singular folders", note: "functions → function." },
  { id: "1.21.9", versionId: "1.21.10", label: "min / max format", note: "Pack formats split into major.minor." },
  { id: "26.3", label: "Wilderness Bound", note: "Format 121.0. The current target." },
];

const ROWS = [
  {
    label: "Function folder",
    cells: ["functions", "function", "function"],
  },
  {
    label: "pack.mcmeta",
    cells: ["pack_format: 26", "min_format: 81", "min/max_format: [121, 0]"],
  },
  {
    label: "Function macros",
    cells: ["yes (1.20.2+)", "yes", "yes"],
  },
  {
    label: "Text components",
    cells: ["JSON", "JSON", "SNBT"],
  },
  {
    label: "Runtime target",
    cells: ["legacy profile", "compatible profile", "primary profile"],
  },
];

export function VersionSection() {
  const current = getVersion("26.3");

  return (
    <section className={`section ${styles.versions}`} id="versions">
      <div className="container">
        <div className={styles.versionsHead}>
          <div>
            <Reveal>
              <span className="eyebrow">04 · Versions</span>
            </Reveal>
            <Reveal delay={60}>
              <h2 className={`display ${styles.versionsTitle}`}>
                Built for 26.3.
                <br />
                Not trapped in it.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={120} className={styles.versionsCopy}>
            <p>
              A version is a profile, not a branch: folder names, pack metadata,
              macro support and text component syntax all live in one table. The
              editor migrates the pack when you switch, then re-lints every
              command against the target version.
            </p>
            <p>
              When 26.4 lands, cmdlib adds a row. It does not fork the product.
            </p>
          </Reveal>
        </div>

        <div className={styles.versionRail} role="list" aria-label="Version milestones">
          <div className={styles.railLine} aria-hidden />
          {MILESTONES.map((milestone, index) => {
            const version = getVersion(milestone.versionId ?? milestone.id);
            const isCurrent = milestone.id === "26.3";
            return (
              <Reveal
                key={milestone.id}
                className={`${styles.railItem} ${isCurrent ? styles.railCurrent : ""}`}
                delay={index * 55}
                as="div"
              >
                <span className={styles.railNode} aria-hidden />
                <span className={styles.railFormat}>{formatPackFormat(version.packFormat)}</span>
                <span className={styles.railVersion}>{milestone.id}</span>
                <span className={styles.railLabel}>{milestone.label}</span>
                <span className={styles.railNote}>{milestone.note}</span>
                {isCurrent && <span className={styles.railBadge}>current</span>}
              </Reveal>
            );
          })}
        </div>

        <div className={styles.versionTableWrap}>
          <div className={styles.versionTable}>
            <div className={styles.versionRowHead}>
              <span>Profile capability</span>
              <span>1.20.4</span>
              <span>1.21.8</span>
              <span className={styles.versionColCurrent}>26.3</span>
            </div>
            {ROWS.map((row) => (
              <div key={row.label} className={styles.versionRow}>
                <span>{row.label}</span>
                <span>{row.cells[0]}</span>
                <span>{row.cells[1]}</span>
                <span className={styles.versionColCurrent}>{row.cells[2]}</span>
              </div>
            ))}
          </div>
          <div className={styles.versionAside}>
            <div className={styles.versionCard}>
              <span className={styles.versionCardLabel}>Primary profile</span>
              <strong>{current.label}</strong>
              <dl>
                <div><dt>pack format</dt><dd>{formatPackFormat(current.packFormat)}</dd></div>
                <div><dt>data version</dt><dd>{current.dataVersion}</dd></div>
                <div><dt>protocol</dt><dd>{current.protocol}</dd></div>
                <div><dt>released</dt><dd>{current.release}</dd></div>
              </dl>
            </div>
            <pre className={styles.profileCode} aria-label="Version profile fields">
{`{
  "id": "26.3",
  "packFormat": [121, 0],
  "functionFolder": "function",
  "macros": true,
  "textComponents": "snbt"
}`}
            </pre>
            <p className={styles.versionFootnote}>
              No pack-format guessing. The linter can tell you that{" "}
              <code>/compute</code> is a 26.3 command before you ship it to a
              1.21 server.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
