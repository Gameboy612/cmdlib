"use client";

import { useEffect, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import styles from "./ctf.module.css";

export function CtfModal() {
  const ctf = useWorkbench((state) => state.ctf);
  const open = useWorkbench((state) => state.ctfModalOpen);
  const setOpen = useWorkbench((state) => state.setCtfModalOpen);
  const submitFlag = useWorkbench((state) => state.submitFlag);
  const sim = useWorkbench((state) => state.sim);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  if (!ctf || !open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      setError("Enter a flag first.");
      return;
    }
    if (submitFlag(value)) {
      setError(null);
      setValue("");
    } else {
      setError("That flag is not correct.");
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="CTF challenge">
        <div className={styles.head}>
          <div>
            <span className={styles.eyebrow}>Challenge · read-only</span>
            <h2 className={styles.title}>{ctf.title}</h2>
            <div className={styles.meta}>
              <span>{ctf.category}</span>
              <span>difficulty {ctf.difficulty}</span>
              <span>{ctf.solved ? "solved" : "unsolved"}</span>
              <span>{sim.project.id.startsWith("ctf-server-") ? "hidden server" : "public fallback"}</span>
            </div>
          </div>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close challenge">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.description}>{ctf.description}</p>
          {ctf.solved ? (
            <div className={styles.solved}>✓ Correct flag submitted. Challenge complete.</div>
          ) : (
            <form className={styles.form} onSubmit={submit}>
              <input
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
                }}
                placeholder="cuhkctf26{...}"
                aria-label="Flag"
                spellCheck={false}
                autoFocus
              />
              <button type="submit">Submit</button>
            </form>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <p className={styles.hint}>
            You can inspect only public files. Commands run as a normal player.
            The submitted flag is checked against{" "}
            <code>.secret/flag.txt</code>.
            <br />
            {ctf.hint}
          </p>
          <div className={styles.links}>
            <button type="button" className={styles.close} onClick={() => setOpen(false)}>
              back to challenge
            </button>
            <a href={ctf.repoUrl} target="_blank" rel="noreferrer">
              challenge repository ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
