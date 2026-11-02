"use client";

import { useEffect, useMemo } from "react";
import { useSimRevision, useWorkbench } from "@/lib/state/workbench";
import type { ScheduledFunction } from "@/lib/mc/world";
import styles from "./timeline.module.css";

const SPEEDS = [0.5, 1, 2, 4] as const;

interface QueueRow {
  functionId: string;
  dueTick: number;
  remaining: number;
  count: number;
}

/**
 * Tick runtime controls and the `/schedule function` queue.
 *
 * Self-contained on purpose: it only reads `sim`/`useSimRevision` from the
 * workbench store, so the shell can mount it as a Dockview panel without any
 * other integration code.
 */
export function TimelinePanel() {
  const sim = useWorkbench((state) => state.sim);
  const revision = useSimRevision();
  const playing = useWorkbench((state) => state.tickPlaying);
  const setPlaying = useWorkbench((state) => state.setTickPlaying);
  const speed = useWorkbench((state) => state.tickSpeed);
  const setSpeed = useWorkbench((state) => state.setTickSpeed);
  const frozen = sim.world.tickFrozen;
  const tickRate = sim.world.tickRate;

  // A new simulator means a new world: stop the old loop and do not carry the
  // playing state across a reset.
  useEffect(() => {
    setPlaying(false);
  }, [sim]);

  const setFrozen = (next: boolean) => {
    sim.world.tickFrozen = next;
    sim.world.touch();
  };

  const queues = useMemo<QueueRow[]>(() => {
    void revision;
    const grouped = new Map<string, ScheduledFunction[]>();
    for (const entry of sim.scheduled) {
      const list = grouped.get(entry.functionId);
      if (list) list.push(entry);
      else grouped.set(entry.functionId, [entry]);
    }
    return [...grouped.entries()]
      .map(([functionId, entries]) => {
        const sorted = [...entries].sort(
          (a, b) => a.dueTick - b.dueTick || a.sequence - b.sequence,
        );
        const dueTick = sorted[0].dueTick;
        return {
          functionId,
          dueTick,
          remaining: Math.max(0, dueTick - sim.world.tick),
          count: sorted.length,
        };
      })
      .sort(
        (a, b) =>
          a.dueTick - b.dueTick || a.functionId.localeCompare(b.functionId),
      );
  }, [sim, revision]);

  const tickTagCount = sim.world.getFunctionTag("minecraft:tick")?.values.length ?? 0;
  const scheduledCount = sim.scheduled.length;

  return (
    <div className={styles.panel} aria-label="Timeline">
      <div className={styles.bar}>
        <span className={styles.title}>Timeline</span>
        <span className={`${styles.status} ${playing && !frozen ? styles.statusOn : ""} ${frozen ? styles.statusFrozen : ""}`}>
          <i className={styles.dot} aria-hidden />
          {frozen ? "frozen" : playing ? "playing" : "paused"}
        </span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.button} ${styles.play}`}
          onClick={() => {
            if (frozen) {
              setFrozen(false);
              setPlaying(true);
            } else {
              setPlaying(!playing);
            }
          }}
          aria-pressed={playing && !frozen}
          title={playing && !frozen ? "Pause the tick loop" : "Start the tick loop"}
        >
          <span aria-hidden>{playing && !frozen ? "❚❚" : "▶"}</span>
          {playing && !frozen ? "pause" : "play"}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => sim.tick()}
          title="Advance exactly one tick"
        >
          <span aria-hidden>▸|</span>
          step
        </button>
        <button
          type="button"
          className={`${styles.button} ${frozen ? styles.freezeOn : ""}`}
          onClick={() => setFrozen(!frozen)}
          aria-pressed={frozen}
          title={frozen ? "Unfreeze the simulation" : "Freeze the simulation"}
        >
          <span aria-hidden>{frozen ? "❄" : "❄"}</span>
          {frozen ? "unfreeze" : "freeze"}
        </button>
        <label className={styles.speed}>
          <span>rate</span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={tickRate}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next) || next < 1 || next > 10000) return;
              sim.world.tickRate = next;
              sim.world.touch();
            }}
            aria-label="Tick rate"
          />
        </label>
        <label className={styles.speed}>
          <span>speed</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            aria-label="Timeline speed"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}× · {Math.round(tickRate * value)} tps
              </option>
            ))}
          </select>
        </label>
        <span className={styles.tick} title="Current world tick">
          tick <b>{sim.world.tick}</b>
        </span>
      </div>

      <div className={styles.sectionHead}>
        <span>
          scheduled <b>{scheduledCount}</b>
        </span>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => sim.clearSchedules()}
          disabled={scheduledCount === 0}
          title="Clear every scheduled function"
        >
          clear all
        </button>
      </div>

      <div className={styles.list}>
        {queues.length === 0 ? (
          <div className={styles.empty}>
            Nothing scheduled. Use{" "}
            <code>/schedule function &lt;id&gt; &lt;time&gt;</code> to queue a
            function.
          </div>
        ) : (
          queues.map((row) => (
            <div className={styles.row} key={row.functionId}>
              <span className={styles.functionId} title={row.functionId}>
                {row.functionId}
              </span>
              <span className={styles.meta}>
                due <b>{row.dueTick}</b>
              </span>
              <span className={styles.meta}>in {row.remaining}t</span>
              <span
                className={`${styles.badge} ${row.count > 1 ? styles.badgeQueue : ""}`}
                title={`${row.count} queued call${row.count === 1 ? "" : "s"}`}
              >
                queue ×{row.count}
              </span>
              <button
                type="button"
                className={styles.rowClear}
                onClick={() => sim.clearSchedules(row.functionId)}
                title={`Clear ${row.functionId}`}
                aria-label={`Clear ${row.functionId}`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.foot}>
        <span>
          minecraft:tick ·{" "}
          {tickTagCount === 0
            ? "no functions"
            : `${tickTagCount} function${tickTagCount === 1 ? "" : "s"}`}
        </span>
        <span className={styles.footRight}>{tickRate} tps base</span>
      </div>
    </div>
  );
}

export default TimelinePanel;
