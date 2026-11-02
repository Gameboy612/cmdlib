"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { SearchPanel } from "./SearchPanel";
import { TimelineDriver } from "./TimelineDriver";
import { Preferences } from "./Preferences";
import { usePreferences } from "@/lib/state/preferences";
import { matchesBinding } from "@/lib/keybindings";
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
  const setSearchOpen = useWorkbench((state) => state.setSearchOpen);
  const runLoad = useWorkbench((state) => state.runLoad);
  const runActive = useWorkbench((state) => state.runActive);
  const showToast = useWorkbench((state) => state.showToast);
  const preferencesOpen = useWorkbench((state) => state.preferencesOpen);
  const setPreferencesOpen = useWorkbench((state) => state.setPreferencesOpen);
  const keybindings = usePreferences((state) => state.keybindings);
  const hydratePreferences = usePreferences((state) => state.hydrate);
  const narrow = useMediaQuery("(max-width: 900px)");

  useEffect(() => {
    hydrate();
    hydratePreferences();
  }, [hydrate, hydratePreferences]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (useWorkbench.getState().preferencesOpen) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(true);
      } else if (matchesBinding(event, keybindings.reload)) {
        event.preventDefault();
        event.stopPropagation();
        runLoad();
      } else if (!typing && matchesBinding(event, keybindings.runActive)) {
        event.preventDefault();
        event.stopPropagation();
        runActive();
      } else if (matchesBinding(event, keybindings.palette)) {
        event.preventDefault();
        event.stopPropagation();
        setPaletteOpen(true);
      } else if (matchesBinding(event, keybindings.preferences)) {
        event.preventDefault();
        event.stopPropagation();
        setPreferencesOpen(true);
      } else if (matchesBinding(event, keybindings.save)) {
        event.preventDefault();
        event.stopPropagation();
        showToast("Pack saved to this browser", "success");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    keybindings,
    runActive,
    runLoad,
    setPaletteOpen,
    setPreferencesOpen,
    setSearchOpen,
    showToast,
  ]);

  if (!hydrated) return <BootScreen />;

  return (
    <div className={styles.shell}>
      <Toolbar />
      <main className={styles.main}>
        {narrow ? <MobileWorkspace /> : <DockWorkspace key={layoutNonce} />}
      </main>
      <StatusBar />
      <TimelineDriver />
      <CommandPalette />
      <SearchPanel />
      <Preferences open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
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
