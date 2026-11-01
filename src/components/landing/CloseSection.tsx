"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { createProject } from "@/lib/mc/datapack";
import { Simulator } from "@/lib/mc/simulator";
import styles from "./landing.module.css";
import { asset } from "@/lib/base-path";

const SUGGESTIONS = [
  "data get storage cmdlib:board quest",
  "scoreboard players get @s points",
  "title @s title {\"text\":\"Hello from 26.3\",\"color\":\"gold\"}",
];

export function CloseSection() {
  const simRef = useRef<Simulator | null>(null);
  const [command, setCommand] = useState(SUGGESTIONS[0]);
  const [output, setOutput] = useState<string[]>([
    "ready · 26.3 profile loaded · type a command and press Enter",
  ]);

  const ensureSimulator = () => {
    if (!simRef.current) {
      const sim = new Simulator({ project: createProject("26.3") });
      sim.reset();
      simRef.current = sim;
    }
    return simRef.current;
  };

  const run = (event?: React.FormEvent) => {
    event?.preventDefault();
    const value = command.trim();
    if (!value) return;
    const sim = ensureSimulator();
    const before = sim.world.logs.length;
    sim.runCommand(value);
    const entries = sim.world.logs
      .slice(before)
      .filter((entry) => entry.kind !== "system")
      .slice(-4)
      .map((entry) => entry.text);
    setOutput(entries.length > 0 ? entries : ["ok"]);
  };

  return (
    <section className={`paper ${styles.close}`} id="close">
      <div className={styles.closeGrid} aria-hidden />
      <div className={`container ${styles.closeInner}`}>
        <div className={styles.closeTop}>
          <Reveal>
            <span className="eyebrow">06 · The part where you open it</span>
          </Reveal>
          <Reveal delay={60}>
            <h2 className={`display ${styles.closeTitle}`}>
              Stop launching.
              <br />
              Start shipping.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className={styles.closeLead}>
              Your next datapack does not need a world load. It needs a place to
              write, a runtime that answers, and a preview that shows you the
              truth.
            </p>
          </Reveal>
        </div>

        <Reveal delay={160} className={styles.promptWrap}>
          <div className={styles.promptCard}>
            <div className={styles.promptChrome}>
              <span className={styles.promptDots}><i /><i /><i /></span>
              <span>try a command · 26.3 runtime</span>
              <span className={styles.promptHint}>real engine, no server</span>
            </div>
            <form className={styles.promptForm} onSubmit={run}>
              <span className={styles.promptSign} aria-hidden>/</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                aria-label="Run a Minecraft command"
                spellCheck={false}
                className={styles.promptInput}
              />
              <button type="submit" className="button button--small">
                Run
              </button>
            </form>
            <div className={styles.promptOutput} aria-live="polite">
              {output.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <div className={styles.promptSuggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setCommand(suggestion)}
                >
                  {suggestion.length > 48 ? suggestion.slice(0, 45) + "…" : suggestion}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.closeActions}>
            <Link className="button" href="/editor/">
              Open the editor <span aria-hidden>→</span>
            </Link>
            <a className="button button--ghost" href={asset("/credits/")}>
              Credits & licenses
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
