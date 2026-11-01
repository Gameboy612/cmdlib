"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ToastHost } from "./Toast";
import { MobileWorkspace } from "./MobileWorkspace";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";

const DockWorkspace = dynamic(
  () => import("./DockWorkspace").then((mod) => mod.DockWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className={styles.dockLoading}>
        <span>assembling dock…</span>
      </div>
    ),
  },
);

export function EditorShell() {
  const hydrate = useWorkbench((state) => state.hydrate);
  const hydrated = useWorkbench((state) => state.hydrated);
  const layoutNonce = useWorkbench((state) => state.layoutNonce);
  const setPaletteOpen = useWorkbench((state) => state.setPaletteOpen);
  const runLoad = useWorkbench((state) => state.runLoad);
  const showToast = useWorkbench((state) => state.showToast);
  const narrow = useMediaQuery("(max-width: 900px)");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "F5") {
        event.preventDefault();
        runLoad();
      } else if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        showToast("Pack saved to this browser", "success");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runLoad, setPaletteOpen, showToast]);

  if (!hydrated) return <BootScreen />;

  return (
    <div className={styles.shell}>
      <Toolbar />
      <main className={styles.main}>
        {narrow ? <MobileWorkspace /> : <DockWorkspace key={layoutNonce} />}
      </main>
      <StatusBar />
      <CommandPalette />
      <ToastHost />
    </div>
  );
}

function BootScreen() {
  return (
    <div className={styles.boot}>
      <div className={styles.bootInner}>
        <img src={asset("/art/mark.svg")} alt="" width={54} height={54} />
        <span className={styles.bootWord}>cmdlib</span>
        <span className={styles.bootStatus}>booting the command runtime</span>
        <span className={styles.bootBar}><i /></span>
        <span className={styles.bootVersion}>26.3 · pack format 121.0</span>
      </div>
    </div>
  );
}
