"use client";

import { useMemo, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { createProject } from "@/lib/mc/datapack";
import { lintProject, toLspDiagnostics } from "@/lib/lint";
import { copyText } from "@/lib/io";
import styles from "./landing.module.css";
import { asset } from "@/lib/base-path";

const SAMPLE = [
  "scoreboard players add @s points 10",
  "scoreboard players add @s prestige 10",
  "function cmdlib:reward",
  "give @s minecraft:diamond 1",
  "title @s title",
  "data get storage cmdlib:board quest",
];

export function LintSection() {
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => {
    const project = createProject("26.3");
    // Give the sample a declared objective and a macro function so the report
    // demonstrates unknown-objective, macro-argument and unsupported-command
    // rules rather than failing on the clean starter pack itself.
    project.files["data/cmdlib/function/load.mcfunction"] =
      "scoreboard objectives add points dummy\n";
    project.files["data/cmdlib/function/reward.mcfunction"] =
      "$scoreboard players add @s points $(amount)\n";
    const path = "data/cmdlib/function/start.mcfunction";
    project.files[path] = SAMPLE.join("\n");
    const result = lintProject(project);
    return {
      project,
      path,
      result,
      diagnostics: result.diagnostics.filter(
        (entry) => entry.path === path && entry.code !== "unused-function",
      ),
    };
  }, []);

  const copy = async () => {
    await copyText(JSON.stringify(toLspDiagnostics(report.diagnostics), null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section className={`section ${styles.lint}`} id="lint">
      <div className={styles.lintGlow} aria-hidden />
      <div className="container">
        <div className={styles.lintGrid}>
          <div className={styles.lintCopy}>
            <Reveal>
              <span className="eyebrow">05 · Correctness</span>
            </Reveal>
            <Reveal delay={60}>
              <h2 className={`display ${styles.lintTitle}`}>
                Correct
                <br />
                before you
                <br />
                launch.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.lintLead}>
                The linter is not a regex. It parses every line with the same
                grammar the runtime executes, checks objectives and functions
                across the whole pack, and understands which commands exist in
                which version.
              </p>
            </Reveal>

            <Reveal delay={180} className={styles.lintPoints}>
              <div>
                <span>01</span>
                <p><b>Syntax to semantics.</b> Unknown objectives, missing macro arguments, malformed NBT paths, wrong argument counts.</p>
              </div>
              <div>
                <span>02</span>
                <p><b>Version-aware.</b> A 26.3 command is flagged before it reaches a 1.21 world. Legacy folders are migration issues, not mystery load failures.</p>
              </div>
              <div>
                <span>03</span>
                <p><b>Portable output.</b> Copy diagnostics as LSP JSON, or read the rule code and jump to the same span in your editor.</p>
              </div>
            </Reveal>

            <Reveal delay={220} className={styles.lintCredits}>
              <span className={styles.lintCreditsLabel}>Built with respect for the tools before us</span>
              <p>
                Rule semantics are modelled on{" "}
                <a href="https://github.com/SpyglassMC/Spyglass" target="_blank" rel="noreferrer">Spyglass</a>{" "}
                (MIT) and{" "}
                <a href="https://www.npmjs.com/package/mclint" target="_blank" rel="noreferrer">mclint</a>{" "}
                (ISC). Both licenses permit commercial use with attribution. No
                GPL or AGPL linter code is bundled.
              </p>
              <a className={styles.textLink} href={asset("/credits/")}>
                Read the license audit <span aria-hidden>→</span>
              </a>
            </Reveal>
          </div>

          <Reveal delay={100} className={styles.lintPanelWrap}>
            <div className={styles.lintPanel}>
              <div className={styles.lintChrome}>
                <span className={styles.lintDots}><i /><i /><i /></span>
                <span>Problems</span>
                <span className={styles.lintChromeCount}>
                  {report.result.errors} error{report.result.errors === 1 ? "" : "s"} ·{" "}
                  {report.result.warnings} warning{report.result.warnings === 1 ? "" : "s"}
                </span>
              </div>
              <div className={styles.lintCode}>
                {SAMPLE.map((line, index) => {
                  const diagnostic = report.diagnostics.find((entry) => entry.line === index + 1);
                  return (
                    <div
                      key={line}
                      className={`${styles.lintCodeLine} ${diagnostic ? styles[`lint_${diagnostic.severity}`] : ""}`}
                    >
                      <span className={styles.lintLineNo}>{index + 1}</span>
                      <code>{line}</code>
                      {diagnostic && (
                        <span className={styles.lintGutterMark} aria-label={diagnostic.severity}>
                          {diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={styles.lintProblems}>
                {report.diagnostics.slice(0, 5).map((diagnostic) => (
                  <article key={diagnostic.id} className={styles.problem}>
                    <span className={`${styles.problemDot} ${styles[`problem_${diagnostic.severity}`]}`} />
                    <div>
                      <div className={styles.problemHead}>
                        <span className={styles.problemCode}>{diagnostic.code}</span>
                        <span className={styles.problemPos}>
                          {diagnostic.line}:{diagnostic.column}
                        </span>
                      </div>
                      <p>{diagnostic.message}</p>
                    </div>
                  </article>
                ))}
                {report.diagnostics.length === 0 && (
                  <p className={styles.problemEmpty}>No problems. Suspicious.</p>
                )}
              </div>
              <div className={styles.lintFoot}>
                <span>LSP-compatible · in-browser</span>
                <button type="button" className="button button--small button--ghost" onClick={copy}>
                  {copied ? "Copied ✓" : "Copy LSP JSON"}
                </button>
              </div>
            </div>
            <span className={styles.lintCaption}>
              A real report from the cmdlib linter, generated in this page.
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
