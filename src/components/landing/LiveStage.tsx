"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Simulator } from "@/lib/mc/simulator";
import { createLandingProject } from "@/lib/mc/datapack";
import { useScrollProgress } from "@/lib/hooks/useScrollProgress";
import { useMediaQuery, useReducedMotion } from "@/lib/hooks/useMedia";
import { WorldView } from "@/components/preview/WorldView";
import styles from "./landing.module.css";

interface DemoStep {
  id: string;
  feature: string;
  code: string;
  commands: string[];
  result: string;
}

const STEPS: DemoStep[] = [
  {
    id: "score",
    feature: "scoreboard",
    code: "scoreboard players add @s progress 25",
    commands: ["scoreboard players add @s progress 25"],
    result: "progress 25",
  },
  {
    id: "storage",
    feature: "data storage",
    code: 'data modify storage landing:state stage set value "mapped"',
    commands: [
      'data modify storage landing:state stage set value "mapped"',
      'title @s actionbar {"text":"storage written","color":"aqua"}',
    ],
    result: 'stage = "mapped"',
  },
  {
    id: "execute",
    feature: "execute + NBT",
    code: "execute as @e[tag=target] at @s run data modify entity @s Pos set value [2.0d,64.0d,2.0d]",
    commands: [
      "scoreboard players add @s progress 25",
      "execute as @e[tag=target] at @s run data modify entity @s Pos set value [2.0d,64.0d,2.0d]",
    ],
    result: "target moved to 2 64 2",
  },
  {
    id: "macro",
    feature: "function macros",
    code: 'function landing:stamp {stage:"interpolated"}',
    commands: [
      "scoreboard players add @s progress 25",
      'function landing:stamp {stage:"interpolated"}',
    ],
    result: "macro expanded",
  },
  {
    id: "title",
    feature: "title",
    code: 'title @s title {"text":"THE WORLD ANSWERED","color":"gold","bold":true}',
    commands: [
      "scoreboard players set @s progress 100",
      'title @s title {"text":"THE WORLD ANSWERED","color":"gold","bold":true}',
      'title @s subtitle {"text":"0 server. 0 launch. 100% in the tab.","color":"gray"}',
      "data get storage landing:state",
    ],
    result: "title displayed · progress 100",
  },
];

const THRESHOLDS = [0.06, 0.28, 0.5, 0.7, 0.88];

export function LiveStage() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isNarrow = useMediaQuery("(max-width: 880px)");
  const reduced = useReducedMotion();
  const pinned = !isNarrow && !reduced;
  const progress = useScrollProgress(sectionRef, pinned);
  const [sim] = useState(() => new Simulator({ project: createLandingProject("26.3") }));
  const revision = useSyncExternalStore(sim.subscribe, sim.getSnapshot, () => 0);
  const [executed, setExecuted] = useState(0);
  const executedRef = useRef(0);

  useEffect(() => {
    sim.reset();
  }, [sim]);

  const runStep = (index: number) => {
    if (index >= STEPS.length) return;
    for (const command of STEPS[index].commands) sim.runCommand(command);
    executedRef.current = index + 1;
    setExecuted(index + 1);
  };

  useEffect(() => {
    if (!pinned) return;
    if (progress < 0.035 && executedRef.current > 0) {
      sim.reset();
      executedRef.current = 0;
      setExecuted(0);
      return;
    }
    const desired = THRESHOLDS.filter((threshold) => progress >= threshold).length;
    while (executedRef.current < desired) {
      runStep(executedRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, pinned, sim]);

  const advance = () => {
    if (executedRef.current >= STEPS.length) {
      sim.reset();
      executedRef.current = 0;
      setExecuted(0);
      return;
    }
    runStep(executedRef.current);
  };

  const activeIndex = Math.min(STEPS.length - 1, executed);
  const lastLog = [...sim.world.logs]
    .reverse()
    .find((entry) => entry.kind === "data" || entry.kind === "chat" || entry.kind === "error");

  return (
    <section id="run" className={styles.run} ref={sectionRef}>
      <div className={styles.runSticky}>
        <div className={`container ${styles.runInner}`}>
          <div className={styles.runHeader}>
            <div>
              <span className="eyebrow">02 · Live runtime</span>
              <h2 className={`display ${styles.runTitle}`}>
                Scroll is
                <br />
                the tick.
              </h2>
            </div>
            <div className={styles.runHeaderCopy}>
              <p>
                Every notch of the wheel executes a real command in a real command
                runtime. The scoreboard, the macro, the title and the moved
                entity are produced by the same engine that powers the editor.
              </p>
              <span className={styles.runProof}>
                <span className="dot" /> no video · no mock · no Minecraft process
              </span>
              <button type="button" className={styles.runMobileTick} onClick={advance}>
                {executed >= STEPS.length ? "Replay sequence" : "Run next tick"}
              </button>
            </div>
          </div>

          <div className={styles.runGrid}>
            <div className={styles.runCodePanel}>
              <div className={styles.runCodeChrome}>
                <span className={styles.windowTab}>cmdlib:demo.mcfunction</span>
                <span className={styles.runTick}>tick {executed}</span>
              </div>
              <div className={styles.runLines}>
                {STEPS.map((step, index) => {
                  const state = index < executed ? "done" : index === executed ? "active" : "pending";
                  return (
                    <div key={step.id} className={`${styles.runLine} ${styles[`runLine_${state}`]}`}>
                      <span className={styles.runStateIcon} aria-hidden>
                        {state === "done" ? "✓" : state === "active" ? "›" : "·"}
                      </span>
                      <div>
                        <code>{step.code}</code>
                        <span className={styles.runFeature}>{step.feature}</span>
                      </div>
                      <span className={styles.runResult}>
                        {state === "done" ? step.result : state === "active" ? "executing" : "queued"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.runConsole}>
                <span className={styles.runConsoleLabel}>output</span>
                <code>
                  {lastLog
                    ? lastLog.text
                    : executed === 0
                      ? "Waiting for the first tick…"
                      : "commands executed"}
                </code>
              </div>
            </div>

            <div className={styles.runViewport}>
              <WorldView world={sim.world} revision={revision} compact showHud />
              <div className={styles.runStageBadge}>
                <span className={styles.liveDot} /> LIVE RUNTIME
              </div>
              <div className={styles.runStageFoot}>
                <div className={styles.runProgress}>
                  <span style={{ width: `${(executed / STEPS.length) * 100}%` }} />
                </div>
                <div className={styles.runStageMeta}>
                  <span>{activeIndex >= STEPS.length ? "sequence complete" : STEPS[activeIndex].feature}</span>
                  <span>{Math.round((executed / STEPS.length) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.runFooter}>
            <p>
              This is not a recording. Drop into the editor and the same
              scoreboard, the same storage and the same title are waiting for you.
            </p>
            <div className={styles.runButtons}>
              <button type="button" className="button button--ghost button--small" onClick={advance}>
                {executed >= STEPS.length ? "Replay sequence" : "Run next tick"}
              </button>
              {!pinned && (
                <span className={styles.runHint}>
                  {executed >= STEPS.length ? "Sequence complete." : "Tap through the demo."}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
