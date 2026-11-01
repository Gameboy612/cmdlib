"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./context-menu.module.css";

export interface ContextMenuAction {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuAction | ContextMenuSeparator;

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!menu) return;
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(menu.x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(menu.y, window.innerHeight - rect.height - margin)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu, onClose]);

  if (!mounted || !menu) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label="Context menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.items.map((item, index) =>
        "separator" in item ? (
          <div key={`sep-${index}`} className={styles.separator} role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`${styles.item} ${item.danger ? styles.danger : ""}`}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span>{item.label}</span>
            {item.hint && <span className={styles.hint}>{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
