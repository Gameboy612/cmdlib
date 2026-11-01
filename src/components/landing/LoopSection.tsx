"use client";

import { useRef } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { useScrollProgress } from "@/lib/hooks/useScrollProgress";
import styles from "./landing.module.css";

const STEPS = [
  {
    title: "Cold start",
    detail: "The launcher, the assets, the world. Every idea pays this tax first.",
    tag: "wait",
  },
  {
    title: "World load",
    detail: "Chunks stream in while you remember where your test rig lives.",
    tag: "wait",
  },
  {
    title: "/reload",
    detail: "The closest thing to a fast loop the game has. Still a full stop.",
    tag: "context",
  },
  {
    title: "The typo",
    detail: "One wrong NBT path. No stack trace, just silence and a guess.",
    tag: "guess",
  },
  {
    title: "Relaunch",
    detail: "Because sometimes /reload is not enough, and you already closed it.",
    tag: "wait",
  },
];

export function LoopSection() {
  const ref = useRef<HTMLElement | null>(null);
  const progress = useScrollProgress(ref);
  const active = Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length * 1.18));

  return (
    <section className={`paper ${styles.loop}`} id="loop" ref={ref}>
      <div className={styles.loopGridTexture} aria-hidden />
      <div className={`container ${styles.loopInner}`}>
        <div className={styles.loopLeft}>
          <Reveal>
            <span className="eyebrow">01 · The loop</span>
          </Reveal>
          <Reveal delay={60}>
            <h2 className={`display ${styles.loopTitle}`}>
              You already know
              <br />
              this workflow.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className={styles.loopCopy}>
              Launch the game to test a datapack. Wait for the world. Type a
              command. Watch nothing happen. Reload. Guess. Repeat.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className={styles.loopFootnote}>
              <span className={styles.loopMark}>↳</span>
              <p>
                cmdlib started with a smaller question: what if the edit and the
                answer lived in the same tab?
              </p>
            </div>
          </Reveal>
        </div>

        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={`${styles.step} ${index <= active ? styles.stepActive : ""}`}
            >
              <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.stepBody}>
                <div className={styles.stepHead}>
                  <h3>{step.title}</h3>
                  <span className={styles.stepTag}>{step.tag}</span>
                </div>
                <p>{step.detail}</p>
              </div>
              <span className={styles.stepRail} aria-hidden>
                <i />
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={`container ${styles.loopStatementWrap}`}>
        <Reveal>
          <p className={styles.loopStatement}>
            The feedback loop
            <br />
            <em>is the bug.</em>
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className={styles.loopCosts}>
            <span>Launch tax</span>
            <span>Context switch</span>
            <span>Blind debugging</span>
            <span className={styles.loopCostsNote}>Illustrative, not a benchmark.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
