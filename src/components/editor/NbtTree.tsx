"use client";

import { useState } from "react";
import { isCompound, isList, isString, NbtTag, stringifySnbt, tagTypeName } from "@/lib/mc/nbt";
import styles from "./editor.module.css";

export function NbtTree({
  tag,
  name,
  depth = 0,
  defaultOpen = 2,
}: {
  tag: NbtTag;
  name?: string;
  depth?: number;
  defaultOpen?: number;
}) {
  const expandable = isCompound(tag) || isList(tag);
  const [open, setOpen] = useState(depth < defaultOpen);

  if (!expandable) {
    return (
      <div className={styles.nbtLeaf} style={{ paddingLeft: depth * 12 }}>
        {name !== undefined && <span className={styles.nbtKey}>{name}</span>}
        <span className={styles.nbtType}>{tagTypeName(tag)}</span>
        <span className={styles.nbtValue}>
          {isString(tag) ? JSON.stringify(tag.value) : stringifySnbt(tag, { typed: false })}
        </span>
      </div>
    );
  }

  const entries: Array<[string, NbtTag]> = isCompound(tag)
    ? Object.entries(tag.value)
    : tag.value.map((value, index) => [String(index), value]);
  const summary = isCompound(tag)
    ? `{ ${entries.length} key${entries.length === 1 ? "" : "s"} }`
    : `[ ${entries.length} item${entries.length === 1 ? "" : "s"} ]`;

  return (
    <div className={styles.nbtBranch}>
      <button
        type="button"
        className={styles.nbtBranchHead}
        style={{ paddingLeft: depth * 12 }}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={styles.nbtChevron}>{open ? "▾" : "▸"}</span>
        {name !== undefined && <span className={styles.nbtKey}>{name}</span>}
        <span className={styles.nbtType}>{tagTypeName(tag)}</span>
        <span className={styles.nbtSummary}>{summary}</span>
      </button>
      {open && (
        <div>
          {entries.map(([key, value]) => (
            <NbtTree key={key} tag={value} name={key} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
          {entries.length === 0 && (
            <div className={styles.nbtEmpty} style={{ paddingLeft: (depth + 1) * 12 }}>
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}
