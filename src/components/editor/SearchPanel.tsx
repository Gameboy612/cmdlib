"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "@/lib/state/workbench";
import styles from "./search.module.css";

interface Hit {
  path: string;
  line: number;
  text: string;
}

const MAX_FILES = 400;
const MAX_HITS = 2_000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function SearchPanel() {
  const open = useWorkbench((state) => state.searchOpen);
  const setOpen = useWorkbench((state) => state.setSearchOpen);
  const project = useWorkbench((state) => state.project);
  const goTo = useWorkbench((state) => state.goTo);
  const replaceAllInFiles = useWorkbench((state) => state.replaceAllInFiles);
  const showToast = useWorkbench((state) => state.showToast);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  const search = useMemo(() => {
    const value = deferredQuery.trim();
    if (!value) return { hits: [] as Hit[], truncated: false, error: null as string | null };
    let regex: RegExp;
    try {
      regex = new RegExp(
        useRegex ? value : escapeRegex(value),
        `g${caseSensitive ? "" : "i"}`,
      );
    } catch {
      return { hits: [], truncated: false, error: "Invalid regular expression" };
    }
    const hits: Hit[] = [];
    let files = 0;
    let truncated = false;
    for (const [path, content] of Object.entries(project.files)) {
      if (files >= MAX_FILES || hits.length >= MAX_HITS) {
        truncated = true;
        break;
      }
      const lines = content.split(/\r?\n/);
      let fileHit = false;
      for (let index = 0; index < lines.length; index++) {
        regex.lastIndex = 0;
        if (!regex.test(lines[index])) continue;
        fileHit = true;
        hits.push({ path, line: index + 1, text: lines[index] });
        if (hits.length >= MAX_HITS) {
          truncated = true;
          break;
        }
      }
      if (fileHit) files++;
    }
    return { hits, truncated, error: null as string | null };
  }, [project.files, deferredQuery, useRegex, caseSensitive]);

  const grouped = useMemo(() => {
    const map = new Map<string, Hit[]>();
    for (const hit of search.hits) {
      const list = map.get(hit.path);
      if (list) list.push(hit);
      else map.set(hit.path, [hit]);
    }
    return [...map.entries()];
  }, [search.hits]);

  if (!open) return null;

  const replaceAll = () => {
    if (!query.trim()) return;
    setReplacing(true);
    setError(null);
    try {
      const result = replaceAllInFiles(query, replacement, useRegex, caseSensitive);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.matches === 0) {
        showToast("No matches to replace", "info");
      } else {
        showToast(
          `Replaced ${result.matches} match${result.matches === 1 ? "" : "es"} in ${result.files} file${result.files === 1 ? "" : "s"}`,
          "success",
        );
      }
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search all files">
        <div className={styles.header}>
          <span className={styles.title}>Search all files</span>
          <span className={styles.hint}>Ctrl/Cmd + Shift + F · Esc</span>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close search">
            ×
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError(null);
            }}
            placeholder="Search project"
            spellCheck={false}
            aria-label="Search query"
          />
          <label className={`${styles.toggle} ${useRegex ? styles.toggleActive : ""}`} title="Use regular expression">
            <input type="checkbox" checked={useRegex} onChange={(event) => setUseRegex(event.target.checked)} />
            .*
          </label>
          <label className={`${styles.toggle} ${caseSensitive ? styles.toggleActive : ""}`} title="Match case">
            <input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />
            Aa
          </label>
        </div>

        <div className={styles.replaceRow}>
          <input
            type="text"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="Replace with"
            spellCheck={false}
            aria-label="Replacement"
          />
          <button
            type="button"
            className={styles.replaceAll}
            onClick={replaceAll}
            disabled={replacing || !query.trim()}
          >
            Replace all
          </button>
        </div>

        {error || search.error ? (
          <div className={styles.error}>{error || search.error}</div>
        ) : (
          <div className={styles.status}>
            {deferredQuery.trim()
              ? `${search.hits.length.toLocaleString()} match${search.hits.length === 1 ? "" : "es"} in ${grouped.length.toLocaleString()} file${grouped.length === 1 ? "" : "s"}${search.truncated ? " · showing first results" : ""}`
              : "Search across every file in this pack"}
          </div>
        )}

        <div className={styles.results}>
          {grouped.length === 0 ? (
            <div className={styles.empty}>
              {deferredQuery.trim() ? "No matches" : "Type to search every file in the project"}
            </div>
          ) : (
            grouped.map(([path, hits]) => (
              <div className={styles.fileGroup} key={path}>
                <div className={styles.fileHead}>
                  <span>{path}</span>
                  <span className={styles.fileCount}>{hits.length}</span>
                </div>
                {hits.map((hit) => (
                  <button
                    type="button"
                    className={styles.hit}
                    key={`${hit.path}:${hit.line}`}
                    onClick={() => {
                      goTo(hit.path, hit.line);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.lineNo}>{hit.line}</span>
                    <span className={styles.hitText}>{hit.text.trim() || " "}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span>{useRegex ? "regex" : "literal"} · {caseSensitive ? "case sensitive" : "ignore case"}</span>
          <span>{Object.keys(project.files).length.toLocaleString()} files</span>
        </div>
      </div>
    </div>
  );
}
