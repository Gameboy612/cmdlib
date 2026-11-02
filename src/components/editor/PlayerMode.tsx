"use client";

import { useEffect, useMemo } from "react";
import { useSimRevision, useWorkbench } from "@/lib/state/workbench";
import { entityPos, entityRotation, setEntityPos, type Vec3 } from "@/lib/mc/entities";
import { WorldView } from "@/components/preview/WorldView";
import { ConsolePanel } from "./panels";
import { InventoryPanel } from "./InventoryPanel";
import { ToastHost } from "./Toast";
import styles from "./player-mode.module.css";

export function PlayerMode() {
  const sim = useWorkbench((state) => state.sim);
  const session = useWorkbench((state) => state.playerSession);
  const leave = useWorkbench((state) => state.leavePlayerSession);
  const revision = useSimRevision();
  const world = sim.world;
  const player = world.player() ?? null;

  const move = useMemo(
    () => (forward: number, strafe: number) => {
      const entity = world.player();
      if (!entity) return;
      const pos = entityPos(entity);
      const yaw = (entityRotation(entity).yaw * Math.PI) / 180;
      const next: Vec3 = {
        x: pos.x - Math.sin(yaw) * forward + Math.cos(yaw) * strafe,
        y: pos.y,
        z: pos.z + Math.cos(yaw) * forward + Math.sin(yaw) * strafe,
      };
      setEntityPos(entity, next);
      world.touch();
    },
    [world],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "w" || key === "arrowup") {
        event.preventDefault();
        move(1, 0);
      } else if (key === "s" || key === "arrowdown") {
        event.preventDefault();
        move(-1, 0);
      } else if (key === "a" || key === "arrowleft") {
        event.preventDefault();
        move(0, -1);
      } else if (key === "d" || key === "arrowright") {
        event.preventDefault();
        move(0, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  if (!session) return null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.avatar}>{session.username.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{session.username}</b>
            <span>Permission level 0 · player session</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.hint}>WASD / arrows to move</span>
          <button type="button" className={styles.leave} onClick={leave}>
            Leave world
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.world} aria-label="World view">
          <WorldView
            world={world}
            revision={revision}
            interactive
            selected={player?.uuid ?? null}
            showHud
          />
          <div className={styles.movePad} aria-label="Movement controls">
            <button type="button" onClick={() => move(1, 0)} aria-label="Move forward">↑</button>
            <div>
              <button type="button" onClick={() => move(0, -1)} aria-label="Move left">←</button>
              <button type="button" onClick={() => move(-1, 0)} aria-label="Move backward">↓</button>
              <button type="button" onClick={() => move(0, 1)} aria-label="Move right">→</button>
            </div>
          </div>
        </section>
        <aside className={styles.side}>
          <section className={styles.inventory} aria-label="Player inventory">
            <InventoryPanel />
          </section>
          <section className={styles.console} aria-label="Player console">
            <ConsolePanel />
          </section>
        </aside>
      </main>
      <ToastHost />
    </div>
  );
}
