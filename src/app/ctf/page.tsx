"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CTF_CHALLENGES } from "@/lib/ctf/challenges";
import { useWorkbench } from "@/lib/state/workbench";
import { asset } from "@/lib/base-path";
import styles from "./ctf.module.css";

export default function CtfPage() {
  const router = useRouter();
  const hydrate = useWorkbench((state) => state.hydrate);
  const startChallenge = useWorkbench((state) => state.startChallenge);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const play = async (id: string) => {
    setLoading(id);
    setError(null);
    try {
      await hydrate();
      if (await startChallenge(id)) {
        router.push("/editor/");
      } else {
        setError("Challenge files could not be loaded. Check the repository and try again.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start that challenge.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <img src={asset("/art/mark.svg")} alt="" width={26} height={26} />
            <span>cmdlib</span>
            <em>ctf</em>
          </Link>
          <nav>
            <Link href="/">Home</Link>
            <Link href="/projects/">Projects</Link>
            <Link href="/features/">Features</Link>
            <Link href="/credits/">Credits</Link>
          </nav>
          <Link className={styles.headerCta} href="/projects/">My projects →</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className="container">
          <span className="eyebrow">Capture the flag</span>
          <h1 className={`display ${styles.title}`}>Read. Exploit. Submit.</h1>
          <p className={styles.lede}>
            Minecraft datapack challenges that run directly in the browser.
            Public files are readable, the server pack stays hidden, and
            commands run with regular player permissions.
          </p>
          <div className={styles.heroMeta}>
            <span><b>Challenges</b> {CTF_CHALLENGES.length}</span>
            <span><b>Editor</b> read-only</span>
            <span><b>Commands</b> player level 0</span>
            <span><b>Flag</b> .secret/flag.txt</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>Available challenges</span>
            <h2>Workshop labs.</h2>
          </div>
          <p>
            Each challenge pulls its public files and hidden server pack from
            GitHub when it starts. Your personal projects stay on the separate
            Projects page.
          </p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.grid}>
          {CTF_CHALLENGES.map((challenge) => (
            <article className={styles.card} key={challenge.id}>
              <span className={styles.badge}>CTF</span>
              <h3>{challenge.title}</h3>
              <p>{challenge.description}</p>
              <div className={styles.meta}>
                <span>{challenge.category}</span>
                <span>difficulty {challenge.difficulty}</span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.start}
                  disabled={loading !== null}
                  onClick={() => void play(challenge.id)}
                >
                  {loading === challenge.id ? "loading…" : "start challenge →"}
                </button>
                <a
                  className={styles.repo}
                  href={challenge.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  repository ↗
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.how}>
          <div className={styles.step}>
            <b>01 / INSPECT</b>
            <h3>Read the public pack</h3>
            <p>Functions, tags and metadata are visible in a read-only editor. No hidden server files appear in the tree.</p>
          </div>
          <div className={styles.step}>
            <b>02 / EXPLOIT</b>
            <h3>Play as a player</h3>
            <p>Run the timeline and use player commands. Operator commands are rejected; creative item access is available when the server grants it.</p>
          </div>
          <div className={styles.step}>
            <b>03 / SUBMIT</b>
            <h3>Check the flag</h3>
            <p>Submit through the challenge modal. The value is checked against the repository’s hidden <code>.secret/flag.txt</code>.</p>
          </div>
        </div>

        <div className={styles.notice}>
          The simulated CTF is browser-side. It hides secret files from the
          editor UI, but a determined player can inspect network traffic. For a
          competitive event, run the real Minecraft server with the hidden
          datapack installed.
        </div>
      </section>

      <footer className={styles.footer}>
        <span>cmdlib · CTF mode · 26.3</span>
        <span>
          <Link href="/projects/">My projects</Link> ·{" "}
          <Link href="/editor/">Open editor</Link> ·{" "}
          <a href="https://github.com/Gameboy612/cmdlib" target="_blank" rel="noreferrer">GitHub</a>
        </span>
      </footer>
    </main>
  );
}
