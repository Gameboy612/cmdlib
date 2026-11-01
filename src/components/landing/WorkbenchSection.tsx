"use client";

import Link from "next/link";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import styles from "./landing.module.css";

const FEATURES = [
  {
    title: "Drag anything anywhere",
    body: "Explorer, editor, preview, console, scoreboards, storage. Split a tab, float a panel, close what you do not need. Your layout is remembered.",
  },
  {
    title: "One command palette",
    body: "Cmd/Ctrl + K reaches every action: run the load tag, open the demo, switch versions, export the pack, jump to a problem.",
  },
  {
    title: "The preview is the state",
    body: "There is no fake screenshot. The viewport projects the actual world model, so changing an entity's Pos in NBT moves the entity.",
  },
  {
    title: "Keyboard first",
    body: "F5 reloads the pack, Ctrl/Cmd + Enter runs the active function, Ctrl/Cmd + S saves locally. No mouse required.",
  },
];

export function WorkbenchSection() {
  const [exploded, setExploded] = useState(false);

  return (
    <section className={`section ${styles.workbench}`} id="workbench">
      <div className="container">
        <div className={styles.workbenchHead}>
          <div>
            <Reveal>
              <span className="eyebrow">03 · The workbench</span>
            </Reveal>
            <Reveal delay={60}>
              <h2 className={`display ${styles.workbenchTitle}`}>
                One window.
                <br />
                The whole loop.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={120} className={styles.workbenchIntro}>
            <p>
              cmdlib is not a text box with a run button. It is a small IDE built
              around the four things a datapack author actually needs: files,
              code, a world, and the console.
            </p>
            <div className={styles.workbenchToggle}>
              <button
                type="button"
                className={`button button--small ${exploded ? "button--ghost" : ""}`}
                onClick={() => setExploded(false)}
                aria-pressed={!exploded}
              >
                Docked
              </button>
              <button
                type="button"
                className={`button button--small ${exploded ? "" : "button--ghost"}`}
                onClick={() => setExploded(true)}
                aria-pressed={exploded}
              >
                Exploded
              </button>
              <span className={styles.toggleHint}>Click to pull the windows apart.</span>
            </div>
          </Reveal>
        </div>

        <div className={`${styles.desk} ${exploded ? styles.deskExploded : ""}`}>
          <div className={styles.deskGlow} aria-hidden />
          <div className={`${styles.deskPanel} ${styles.panelExplorer}`}>
            <div className={styles.deskChrome}>
              <span className={styles.deskDots}><i /><i /><i /></span>
              <span>Explorer</span>
            </div>
            <div className={styles.deskExplorer}>
              <span>data</span>
              <span className={styles.indent}>cmdlib</span>
              <span className={styles.indent2}>function</span>
              <span className={`${styles.indent3} ${styles.deskActive}`}>demo</span>
              <span className={styles.indent3}>load</span>
              <span className={styles.indent3}>reward</span>
              <span className={styles.indent2}>tags</span>
              <span>pack.mcmeta</span>
            </div>
            <div className={styles.deskAdd}>+ new function</div>
          </div>

          <div className={`${styles.deskPanel} ${styles.panelEditor}`}>
            <div className={styles.deskChrome}>
              <span className={styles.deskTab}>demo.mcfunction</span>
              <span className={styles.deskTabMuted}>load.mcfunction</span>
              <span className={styles.deskRun}>F5 run</span>
            </div>
            <div className={styles.deskCode}>
              <div><span>1</span><code><b>scoreboard</b> players add <i>@s</i> points <em>50</em></code></div>
              <div><span>2</span><code><b>function</b> cmdlib:reward <b>with</b> storage cmdlib:board quest</code></div>
              <div className={styles.deskCodeActive}><span>3</span><code><b>data</b> modify entity <i>@e[tag=target]</i> Pos set value [0,64,0]</code></div>
              <div><span>4</span><code><b>execute</b> if score <i>@s</i> streak matches 1.. run <b>title</b> <i>@s</i> actionbar …</code></div>
              <div><span>5</span><code><b>data</b> get storage cmdlib:stats</code></div>
              <div className={styles.deskCursor}><span>6</span><i /></div>
            </div>
            <div className={styles.deskLint}>
              <span className={styles.deskOk}>✓ 0 errors</span>
              <span>0 warnings</span>
              <span>26.3</span>
            </div>
          </div>

          <div className={`${styles.deskPanel} ${styles.panelPreview}`}>
            <div className={styles.deskChrome}>
              <span className={styles.deskDots}><i /><i /><i /></span>
              <span>World preview</span>
              <span className={styles.deskLive}><i /> live</span>
            </div>
            <div className={styles.deskWorld}>
              <span className={styles.deskGrid} />
              <span className={styles.deskEntityPlayer} />
              <span className={styles.deskEntityTarget} />
              <span className={styles.deskEntityBeacon} />
              <span className={styles.deskAxisX}>x</span>
              <span className={styles.deskAxisZ}>z</span>
            </div>
            <div className={styles.deskSidebar}>
              <b>BOUNTY POINTS</b>
              <span>Dev <em>300</em></span>
              <span>Target <em>0</em></span>
            </div>
          </div>

          <div className={`${styles.deskPanel} ${styles.panelConsole}`}>
            <div className={styles.deskChrome}>
              <span className={styles.deskDots}><i /><i /><i /></span>
              <span>Console</span>
              <span className={styles.deskConsoleNote}>run any command</span>
            </div>
            <div className={styles.deskConsole}>
              <div><span className={styles.consolePrompt}>/</span> function cmdlib:load</div>
              <div className={styles.consoleOut}>Storage cmdlib:stats has the following contents: &#123;claims: 0, total: 300&#125;</div>
              <div><span className={styles.consolePrompt}>/</span> data get storage cmdlib:board quest</div>
              <div className={styles.consoleOut}>Storage cmdlib:board has the following contents at path &apos;quest&apos;: &#123;id: &quot;wither_hunt&quot;, reward: 250&#125;</div>
              <div><span className={styles.consolePrompt}>/</span> <span className={styles.consoleCaret} /></div>
            </div>
          </div>
        </div>

        <div className={styles.featureRows}>
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} className={styles.featureRow} delay={index * 70} as="div">
              <span className={styles.featureIndex}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className={styles.workbenchCta}>
          <Link className="button" href="/editor/">
            Open a real workbench <span aria-hidden>↗</span>
          </Link>
          <span>No account. No install. Your pack stays in this browser.</span>
        </Reveal>
      </div>
    </section>
  );
}
