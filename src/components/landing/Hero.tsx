"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./landing.module.css";
import { asset } from "@/lib/base-path";

const CODE_LINES = [
  [
    { text: "scoreboard", tone: "keyword" },
    { text: " objectives add ", tone: "plain" },
    { text: "points", tone: "var" },
    { text: " dummy ", tone: "plain" },
    { text: '{"text":"Bounty Points","color":"gold"}', tone: "string" },
  ],
  [
    { text: "scoreboard", tone: "keyword" },
    { text: " objectives setdisplay ", tone: "plain" },
    { text: "sidebar", tone: "var" },
    { text: " ", tone: "plain" },
    { text: "points", tone: "var" },
  ],
  [
    { text: "function", tone: "keyword" },
    { text: " cmdlib:reward ", tone: "var" },
    { text: "with", tone: "keyword" },
    { text: " storage cmdlib:board quest", tone: "plain" },
  ],
  [
    { text: "data", tone: "keyword" },
    { text: " modify entity ", tone: "plain" },
    { text: "@e[tag=target,limit=1]", tone: "selector" },
    { text: " Pos set value ", tone: "plain" },
    { text: "[0.0d,64.0d,0.0d]", tone: "string" },
  ],
  [
    { text: "title", tone: "keyword" },
    { text: " @s title ", tone: "plain" },
    { text: '{"text":"BOUNTY CLAIMED","color":"gold","bold":true}', tone: "string" },
  ],
];

export function Hero() {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (event: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = element.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        element.style.setProperty("--px", x.toFixed(3));
        element.style.setProperty("--py", y.toFixed(3));
      });
    };
    element.addEventListener("pointermove", onMove);
    return () => {
      element.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className={styles.hero} ref={ref} id="top">
      <div className={styles.heroArt} aria-hidden>
        <img className={styles.heroSky} src={asset("/art/hero-sky.svg")} alt="" />
        <img className={styles.heroIsland} src={asset("/art/hero-island.svg")} alt="" />
        <img className={styles.heroForeground} src={asset("/art/hero-foreground.svg")} alt="" />
        <div className={styles.heroVeil} />
      </div>

      <div className={`container ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <div className={styles.heroKicker}>
            <span className="chip">
              <span className="dot dot--accent" />
              26.3 · Wilderness Bound
            </span>
            <span className={styles.monoSmall}>pack format 121.0</span>
          </div>

          <h1 className={`display ${styles.heroTitle}`}>
            <span className={styles.titleMask}>
              <span>Write the game.</span>
            </span>
            <span className={`${styles.titleMask} ${styles.titleAccent}`}>
              <span>Don&rsquo;t launch it.</span>
            </span>
          </h1>

          <p className={styles.heroLede}>
            cmdlib is a datapack IDE that runs Minecraft in the tab. Scoreboards,
            functions, macros, NBT storage and a live world preview — with a linter
            that knows exactly which version you are targeting.
          </p>

          <div className={styles.heroActions}>
            <Link className="button" href="/editor/">
              Open the editor
              <span aria-hidden>→</span>
            </Link>
            <a className="button button--ghost" href="#run">
              Watch it run
            </a>
          </div>

          <dl className={styles.heroFacts}>
            <div>
              <dt>Runtime</dt>
              <dd>In-browser</dd>
            </div>
            <div>
              <dt>Install</dt>
              <dd>None</dd>
            </div>
            <div>
              <dt>First demo</dt>
              <dd>7 commands</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>Stays local</dd>
            </div>
          </dl>
        </div>

        <div className={styles.heroPanelWrap}>
          <div className={styles.heroPanel} aria-label="cmdlib editor preview">
            <div className={styles.windowChrome}>
              <span className={styles.traffic}><i /><i /><i /></span>
              <span className={styles.windowTab}>demo.mcfunction</span>
              <span className={styles.windowTabMuted}>load.mcfunction</span>
              <span className={styles.windowVersion}>26.3</span>
            </div>
            <div className={styles.windowBody}>
              <aside className={styles.miniTree} aria-hidden>
                <span className={styles.treeTitle}>EXPLORER</span>
                <span className={styles.treeRow}>▾ data</span>
                <span className={styles.treeRow}>&nbsp;&nbsp;▾ cmdlib</span>
                <span className={styles.treeRow}>&nbsp;&nbsp;&nbsp;▾ function</span>
                <span className={`${styles.treeRow} ${styles.treeActive}`}>&nbsp;&nbsp;&nbsp;&nbsp;demo</span>
                <span className={styles.treeRow}>&nbsp;&nbsp;&nbsp;&nbsp;load</span>
                <span className={styles.treeRow}>&nbsp;&nbsp;&nbsp;&nbsp;reward</span>
                <span className={styles.treeRow}>&nbsp;&nbsp;▸ tags</span>
                <span className={styles.treeRow}>▸ pack.mcmeta</span>
              </aside>
              <div className={styles.miniCode}>
                {CODE_LINES.map((line, index) => (
                  <div className={styles.codeLine} key={index}>
                    <span className={styles.lineNo}>{index + 1}</span>
                    <code>
                      {line.map((token, tokenIndex) => (
                        <span key={tokenIndex} className={styles[`tone_${token.tone}`]}>
                          {token.text}
                        </span>
                      ))}
                    </code>
                  </div>
                ))}
                <div className={styles.caretLine}>
                  <span className={styles.lineNo}>6</span>
                  <span className={styles.caret} />
                </div>
                <div className={styles.lintGhost}>
                  <span className={styles.lintWave} />
                  <span>no problems · 0 errors · 0 warnings</span>
                </div>
              </div>
            </div>
            <div className={styles.windowStatus}>
              <span><i className={styles.statusDot} /> simulation ready</span>
              <span>tick 0</span>
              <span>Ln 5, Col 1</span>
              <span>UTF-8</span>
            </div>
          </div>

          <div className={styles.miniPreview} aria-label="Live preview">
            <div className={styles.miniPreviewHead}>
              <span><span className={styles.liveDot} /> LIVE PREVIEW</span>
              <span>y=64</span>
            </div>
            <div className={styles.miniWorld}>
              <span className={styles.blipPlayer} />
              <span className={styles.blipTarget} />
              <span className={styles.blipBeacon} />
              <span className={styles.worldAxis} />
            </div>
            <div className={styles.miniSidebar}>
              <b>BOUNTY POINTS</b>
              <span>Dev <em>50</em></span>
              <span>Target <em>0</em></span>
            </div>
            <div className={styles.miniActionbar}>Reward paid: 250 points</div>
          </div>
        </div>
      </div>

      <div className={styles.scrollCue} aria-hidden>
        <span>scroll to execute</span>
        <span className={styles.cueTrack}><i /></span>
      </div>
    </section>
  );
}
