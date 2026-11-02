"use client";

import { useEffect } from "react";
import { useSimRevision, useWorkbench } from "@/lib/state/workbench";

/** Owns the global tick interval so playback works without the Timeline panel. */
export function TimelineDriver() {
  const sim = useWorkbench((state) => state.sim);
  const playing = useWorkbench((state) => state.tickPlaying);
  const speed = useWorkbench((state) => state.tickSpeed);
  useSimRevision();
  const frozen = sim.world.tickFrozen;
  const tickRate = sim.world.tickRate;

  useEffect(() => {
    if (!playing || frozen) return;
    const interval = Math.max(1, 1000 / (tickRate * speed));
    const timer = window.setInterval(() => sim.tick(), interval);
    return () => window.clearInterval(timer);
  }, [playing, frozen, tickRate, speed, sim]);

  return null;
}
