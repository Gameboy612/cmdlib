"use client";

import { useEffect, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import styles from "./player-mode.module.css";

export function JoinPlayerDialog() {
  const open = useWorkbench((state) => state.joinOpen);
  const setOpen = useWorkbench((state) => state.setJoinOpen);
  const joinAsPlayer = useWorkbench((state) => state.joinAsPlayer);
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (open) setUsername("");
  }, [open]);

  if (!open) return null;
  const submit = () => {
    if (joinAsPlayer(username)) setOpen(false);
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.joinModal} role="dialog" aria-label="Join as player">
        <div className={styles.joinHead}>
          <div>
            <b>Join as player</b>
            <span>Permission level 0 · survival-style view</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor="join-username">Username</label>
          <input
            id="join-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Steve"
            autoFocus
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
          />
          <p>
            You can use level 0 commands only. Authoring panels, scoreboards and
            storage are hidden. Your inventory and movement are live.
          </p>
          <div className={styles.joinActions}>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" disabled={!username.trim()}>Join world</button>
          </div>
        </form>
      </div>
    </div>
  );
}
