"use client";

import { useEffect, useState, type RefObject } from "react";

export function useScrollProgress(ref: RefObject<HTMLElement | null>, enabled = true): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const travel = Math.max(1, element.offsetHeight - window.innerHeight);
      const value = Math.max(0, Math.min(1, -rect.top / travel));
      setProgress(value);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, enabled]);

  return progress;
}
