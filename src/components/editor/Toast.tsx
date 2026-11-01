"use client";

import { useWorkbench } from "@/lib/state/workbench";
import styles from "./editor.module.css";

export function ToastHost() {
  const toast = useWorkbench((state) => state.toast);
  if (!toast) return null;
  return (
    <div className={`${styles.toast} ${styles[`toast_${toast.kind}`]}`} role="status" aria-live="polite">
      <span className={styles.toastIcon}>
        {toast.kind === "success" ? "✓" : toast.kind === "error" ? "!" : "i"}
      </span>
      {toast.message}
    </div>
  );
}
