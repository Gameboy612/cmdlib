"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveWorkspace, useWorkbench, useSimRevision } from "@/lib/state/workbench";
import { WorldView } from "@/components/preview/WorldView";
import { CodeEditor } from "./CodeEditor";
import { NbtTree } from "./NbtTree";
import {
  collectStorageIds,
  displayNameForFile,
  fileKind,
} from "@/lib/mc/datapack";
import { getVersion, VERSIONS, formatPackFormat } from "@/lib/mc/version";
import {
  TAG_KINDS,
  TAG_KIND_META,
  isTagKind,
  tagFolderFor,
  tagKindForFolderName,
  type TagKind,
} from "@/lib/mc/tag-kinds";
import { COMMANDS, COMMAND_NAMES, entityInfo } from "@/lib/mc/data";
import { entityCustomName, entityPos, type EntityData } from "@/lib/mc/entities";
import { stringifySnbt } from "@/lib/mc/nbt";
import { toLspDiagnostics, type Diagnostic as LintDiagnostic } from "@/lib/lint";
import { copyText } from "@/lib/io";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";
import type { DockviewPanelApi } from "dockview";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "@/components/ui/ContextMenu";

/* ------------------------------------------------------------------ */
/* Shared                                                             */
/* ------------------------------------------------------------------ */
function PanelShell({
  title,
  subtitle,
  actions,
  children,
  footer,
  className = "",
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.panel} ${className}`} aria-label={title}>
      {(subtitle || actions) && (
        <div className={styles.panelBar}>
          {subtitle && <span className={styles.panelSubtitle}>{subtitle}</span>}
          {actions && <div className={styles.panelActions}>{actions}</div>}
        </div>
      )}
      <div className={styles.panelBody}>{children}</div>
      {footer && <div className={styles.panelFoot}>{footer}</div>}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <img src={asset("/art/mark.svg")} alt="" width={38} height={38} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function useWorldSnapshot() {
  const sim = useWorkbench((state) => state.sim);
  const revision = useSimRevision();
  return { sim, world: sim.world, revision };
}

/* ------------------------------------------------------------------ */
/* Explorer                                                           */
/* ------------------------------------------------------------------ */
interface TreeNode {
  name: string;
  path: string;
  file: boolean;
  children?: Map<string, TreeNode>;
}

function buildTree(files: Record<string, string>): TreeNode {
  const root: TreeNode = { name: "", path: "", file: false, children: new Map() };
  for (const path of Object.keys(files).sort()) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const nodePath = parts.slice(0, index + 1).join("/");
      if (!node.children) node.children = new Map();
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: nodePath, file: isFile, children: isFile ? undefined : new Map() };
        node.children.set(part, child);
      }
      node = child;
    });
  }
  return root;
}

type ExplorerDraft =
  | { mode: "create"; kind: "file" | "function" | "tag"; folder?: string; tagKind?: TagKind; value: string }
  | { mode: "rename"; path: string; value: string }
  | { mode: "delete"; path: string };

export function ExplorerPanel() {
  const project = useWorkbench((state) => state.project);
  const workspace = useActiveWorkspace();
  const activePath = useWorkbench((state) => state.activePath);
  const openFile = useWorkbench((state) => state.openFile);
  const selectPack = useWorkbench((state) => state.selectPack);
  const addPack = useWorkbench((state) => state.addPack);
  const deletePack = useWorkbench((state) => state.deletePack);
  const setPackName = useWorkbench((state) => state.setPackName);
  const createFile = useWorkbench((state) => state.createFile);
  const deleteFile = useWorkbench((state) => state.deleteFile);
  const renameFile = useWorkbench((state) => state.renameFile);
  const runActive = useWorkbench((state) => state.runActive);
  const lintReport = useWorkbench((state) => state.lintReport);
  const showToast = useWorkbench((state) => state.showToast);
  const version = getVersion(project.versionId);
  const tree = useMemo(() => buildTree(project.files), [project.files]);
  const unusedPaths = useMemo(
    () =>
      new Set(
        lintReport.diagnostics
          .filter((diagnostic) => diagnostic.code === "unused-function")
          .map((diagnostic) => diagnostic.path),
      ),
    [lintReport],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draft, setDraft] = useState<ExplorerDraft | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draftInput = useRef<HTMLInputElement | null>(null);
  const lastCreateNonce = useRef(0);
  const explorerCreate = useWorkbench((state) => state.explorerCreate);

  const activeNamespace = useMemo(() => {
    const match = /^data\/([^/]+)\//.exec(activePath);
    return match?.[1] ?? "cmdlib";
  }, [activePath]);

  const toggle = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  useEffect(() => {
    if (!explorerCreate || explorerCreate.nonce === lastCreateNonce.current) return;
    lastCreateNonce.current = explorerCreate.nonce;
    setDraft({
      mode: "create",
      kind: explorerCreate.kind,
      folder: explorerCreate.folder,
      tagKind:
        explorerCreate.tagKind && isTagKind(explorerCreate.tagKind)
          ? explorerCreate.tagKind
          : "function",
      value:
        explorerCreate.kind === "function"
          ? "new_function"
          : explorerCreate.kind === "tag"
            ? "tick"
            : `${explorerCreate.folder ?? `data/${activeNamespace}/${version.functionFolder}`}/new_file.mcfunction`,
    });
  }, [explorerCreate, activeNamespace, version.functionFolder]);

  useEffect(() => {
    if (!draft || draft.mode === "delete") return;
    const frame = requestAnimationFrame(() => {
      draftInput.current?.focus();
      draftInput.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [draft]);

  const beginCreate = (
    kind: "file" | "function" | "tag",
    folder?: string,
    tagKind: TagKind = "function",
  ) => {
    if (folder) {
      setCollapsed((current) => {
        if (!current.has(folder)) return current;
        const next = new Set(current);
        next.delete(folder);
        return next;
      });
    }
    setDraft({
      mode: "create",
      kind,
      folder,
      tagKind,
      value:
        kind === "function"
          ? "new_function"
          : kind === "tag"
            ? "tick"
            : `${folder ?? `data/${activeNamespace}/${version.functionFolder}`}/new_file.mcfunction`,
    });
  };

  const addFunction = (folder?: string) => beginCreate("function", folder);
  const addTag = (folder?: string, kind: TagKind = "function") => {
    const inferred = folder
      ? tagKindForFolderName(folder.split("/").pop() ?? "")
      : null;
    beginCreate("tag", folder, inferred ?? kind);
  };
  const addFile = (folder?: string) => beginCreate("file", folder);

  const packMenu = (event: React.MouseEvent, packId: string, name: string) => {
    openMenu(event, [
      { label: "Select pack", onSelect: () => selectPack(packId) },
      {
        label: "Rename pack…",
        onSelect: () => {
          const next = window.prompt("Pack name", name);
          if (next?.trim()) setPackName(packId, next.trim());
        },
      },
      { label: "Copy pack name", onSelect: () => copyPath(name) },
      { separator: true },
      {
        label: "Delete pack",
        danger: true,
        disabled: (workspace?.packs.length ?? 0) <= 1,
        onSelect: () => {
          if (window.confirm(`Delete ${name}?`)) deletePack(packId);
        },
      },
    ]);
  };

  const copyPath = (path: string) => {
    copyText(path);
    showToast("Path copied", "success");
  };

  const duplicate = (path: string) => {
    const dot = path.lastIndexOf(".");
    const base = dot > 0 ? path.slice(0, dot) : path;
    const ext = dot > 0 ? path.slice(dot) : "";
    let candidate = `${base}.copy${ext}`;
    let index = 2;
    while (candidate in project.files) {
      candidate = `${base}.copy${index}${ext}`;
      index++;
    }
    createFile(candidate, project.files[path] ?? "");
  };

  const requestDelete = (path: string) => setDraft({ mode: "delete", path });
  const requestRename = (path: string) =>
    setDraft({ mode: "rename", path, value: path });

  const commitDraft = () => {
    if (!draft) return;
    if (draft.mode === "delete") {
      deleteFile(draft.path);
      setDraft(null);
      return;
    }
    const value = draft.value.trim();
    if (!value) {
      setDraft(null);
      return;
    }
    if (draft.mode === "rename") {
      if (renameFile(draft.path, value.replace(/^\/+/, ""))) setDraft(null);
      return;
    }

    const namespace = draft.folder
      ? /^data\/([^/]+)\//.exec(draft.folder)?.[1] ?? activeNamespace
      : activeNamespace;
    if (draft.kind === "function") {
      const target =
        draft.folder && draft.folder.endsWith(`/${version.functionFolder}`)
          ? draft.folder
          : `data/${namespace}/${version.functionFolder}`;
      const name = value
        .replace(/^data\/.+\//, "")
        .replace(/\.mcfunction$/, "")
        .replace(/\s+/g, "_");
      if (createFile(`${target}/${name}.mcfunction`, `# ${namespace}:${name}\n`)) {
        setDraft(null);
      }
      return;
    }
    if (draft.kind === "tag") {
      const tagKind = draft.tagKind ?? "function";
      const tagFolder = tagFolderFor(tagKind, version);
      const target =
        draft.folder && draft.folder.endsWith(`/${tagFolder}`)
          ? draft.folder
          : `data/${namespace}/${tagFolder}`;
      const name = value.replace(/\s+/g, "_").replace(/\.json$/, "");
      if (createFile(`${target}/${name}.json`, `${JSON.stringify({ values: [] }, null, 2)}\n`)) {
        setDraft(null);
      }
      return;
    }

    let path = value.replace(/^\/+/, "");
    if (!path.includes("/") && draft.folder) path = `${draft.folder}/${path}`;
    if (createFile(path, path.endsWith(".json") ? "{}\n" : "")) setDraft(null);
  };

  const moveToFolder = (from: string, folder: string) => {
    const name = from.split("/").pop();
    if (!name) return;
    const to = folder ? `${folder}/${name}` : name;
    setDragPath(null);
    setDropTarget(null);
    if (to === from) return;
    if (renameFile(from, to)) showToast(`Moved ${name}`, "success");
  };

  const openMenu = (event: React.MouseEvent, items: ContextMenuEntry[]) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  };

  const fileMenu = (event: React.MouseEvent, path: string) => {
    openFile(path);
    openMenu(event, [
      { label: "Open", onSelect: () => openFile(path) },
      ...(path.endsWith(".mcfunction")
        ? [{ label: "Run function", onSelect: runActive }]
        : []),
      { label: "Rename…", onSelect: () => requestRename(path) },
      { label: "Duplicate", onSelect: () => duplicate(path) },
      { separator: true },
      { label: "Copy path", onSelect: () => copyPath(path) },
      { separator: true },
      { label: "Delete", danger: true, onSelect: () => requestDelete(path) },
    ]);
  };

  const folderMenu = (event: React.MouseEvent, path: string) => {
    const isFunctionFolder = path.endsWith(`/${version.functionFolder}`);
    const isTagFolder = path.endsWith(`/${version.tagFolder}`);
    openMenu(event, [
      { label: "New file…", onSelect: () => addFile(path) },
      ...(isFunctionFolder
        ? [{ label: "New function…", onSelect: () => addFunction(path) }]
        : []),
      ...(isTagFolder
        ? [{ label: "New tag…", onSelect: () => addTag(path) }]
        : []),
      { separator: true },
      {
        label: collapsed.has(path) ? "Expand" : "Collapse",
        onSelect: () => toggle(path),
      },
      { label: "Copy path", onSelect: () => copyPath(path) },
    ]);
  };

;

;

  const renderDraftRow = (folder: string | undefined, depth: number) => {
    if (!draft || draft.mode !== "create" || draft.folder !== folder) return null;
    const label =
      draft.kind === "function" ? "ƒ function" : draft.kind === "tag" ? "# tag" : "{} file";
    return (
      <div className={`${styles.draftRow} ${styles.draftCreate}`} style={{ paddingLeft: 8 + depth * 13 }}>
        <span className={styles.draftBadge}>{label}</span>
        {draft.kind === "tag" && (
          <select
            className={styles.draftSelect}
            value={draft.tagKind ?? "function"}
            onChange={(event) => {
              const kind = event.target.value;
              if (!isTagKind(kind)) return;
              setDraft((current) =>
                current && current.mode === "create"
                  ? { ...current, tagKind: kind }
                  : current,
              );
            }}
            aria-label="Tag kind"
          >
            {TAG_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {TAG_KIND_META[kind].label}
              </option>
            ))}
          </select>
        )}
        <input
          ref={draftInput}
          value={draft.value}
          placeholder={
            draft.kind === "file" ? "path/to/file.mcfunction" : "name"
          }
          spellCheck={false}
          onChange={(event) =>
            setDraft((current) =>
              current && current.mode === "create"
                ? { ...current, value: event.target.value }
                : current,
            )
          }
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") commitDraft();
            if (event.key === "Escape") setDraft(null);
          }}
          aria-label={`New ${draft.kind} name`}
        />
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.file) {
      const kind = fileKind(node.path);
      const isActive = activePath === node.path;
      const unused = unusedPaths.has(node.path);
      const parent = node.path.includes("/")
        ? node.path.slice(0, node.path.lastIndexOf("/"))
        : "";
      if (draft?.mode === "delete" && draft.path === node.path) {
        return (
          <div key={node.path} className={styles.draftRow} style={{ paddingLeft: 8 + depth * 13 }}>
            <span className={styles.draftBadge}>delete</span>
            <span className={styles.draftAsk}>Delete {node.name}?</span>
            <button
              type="button"
              className={styles.draftConfirm}
              onClick={() => {
                deleteFile(node.path);
                setDraft(null);
              }}
            >
              ✓
            </button>
            <button type="button" className={styles.draftCancel} onClick={() => setDraft(null)}>×</button>
          </div>
        );
      }
      if (draft?.mode === "rename" && draft.path === node.path) {
        return (
          <div key={node.path} className={styles.draftRow} style={{ paddingLeft: 8 + depth * 13 }}>
            <span className={`${styles.fileIcon} ${styles[`fileIcon_${kind}`]}`}>
              {kind === "mcfunction" ? "ƒ" : kind === "json" ? "{}" : "π"}
            </span>
            <input
              ref={draftInput}
              value={draft.value}
              spellCheck={false}
              onChange={(event) =>
                setDraft({ mode: "rename", path: node.path, value: event.target.value })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") commitDraft();
                if (event.key === "Escape") setDraft(null);
              }}
              aria-label={`Rename ${node.path}`}
            />
          </div>
        );
      }
      return (
        <div
          key={node.path}
          className={`${styles.treeRow} ${isActive ? styles.treeRowActive : ""} ${unused ? styles.treeRowUnused : ""}`}
          title={unused ? "Function is never called by this pack" : undefined}
          style={{ paddingLeft: 8 + depth * 13 }}
          onClick={() => openFile(node.path)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", node.path);
            event.dataTransfer.effectAllowed = "move";
            setDragPath(node.path);
          }}
          onDragEnd={() => {
            setDragPath(null);
            setDropTarget(null);
          }}
          onDragOver={(event) => {
            if (!dragPath || dragPath === node.path) return;
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (dragPath) moveToFolder(dragPath, parent);
          }}
          onContextMenu={(event) => fileMenu(event, node.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openFile(node.path);
          }}
        >
          <span className={`${styles.fileIcon} ${styles[`fileIcon_${kind}`]}`}>
            {kind === "mcfunction" ? "ƒ" : kind === "json" ? "{}" : "π"}
          </span>
          <span className={styles.treeName}>{node.name}</span>
          {unused && <span className={styles.treeWarn} aria-label="Unused function">△</span>}
          <span className={styles.treeActions}>
            <button type="button" aria-label={`Rename ${node.path}`} onClick={(event) => { event.stopPropagation(); requestRename(node.path); }}>
              ✎
            </button>
            <button type="button" aria-label={`Delete ${node.path}`} onClick={(event) => { event.stopPropagation(); requestDelete(node.path); }}>
              ×
            </button>
          </span>
        </div>
      );
    }
    const isCollapsed = collapsed.has(node.path);
    return (
      <div key={node.path}>
        {node.name && (
          <div
            className={`${styles.treeFolder} ${dropTarget === node.path ? styles.treeDrop : ""}`}
            style={{ paddingLeft: 8 + depth * 13 }}
            onClick={() => toggle(node.path)}
            onDragOver={(event) => {
              if (!dragPath) return;
              event.preventDefault();
              event.stopPropagation();
              setDropTarget(node.path);
            }}
            onDragLeave={() => setDropTarget((current) => (current === node.path ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragPath) moveToFolder(dragPath, node.path);
            }}
            onContextMenu={(event) => folderMenu(event, node.path)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") toggle(node.path);
            }}
          >
            <span className={styles.treeChevron}>{isCollapsed ? "▸" : "▾"}</span>
            <span className={styles.folderIcon}>▣</span>
            <span>{node.name}</span>
          </div>
        )}
        {!isCollapsed && renderDraftRow(node.path, depth + 1)}
        {!isCollapsed &&
          node.children &&
          [...node.children.values()]
            .sort((a, b) => {
              if (a.file !== b.file) return a.file ? 1 : -1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => renderNode(child, node.name ? depth + 1 : depth))}
      </div>
    );
  };

  return (
    <div className={`${styles.panel} ${styles.explorerPanel}`}>
      {workspace && workspace.packs.length > 1 && (
        <div className={styles.packList}>
          {workspace.packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className={`${styles.packRow} ${pack.id === project.id ? styles.packRowActive : ""}`}
              onClick={() => selectPack(pack.id)}
              onContextMenu={(event) => packMenu(event, pack.id, pack.name)}
              title={`${pack.name} · ${pack.versionId}`}
            >
              <span className={styles.packDot} />
              <span className={styles.packName}>{pack.name}</span>
              <span className={styles.packVersion}>{pack.versionId}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className={`${styles.tree} ${dropTarget === "" ? styles.treeDrop : ""}`}
        onContextMenu={(event) =>
          openMenu(event, [
            { label: "New function…", onSelect: () => addFunction() },
            { label: "New file…", onSelect: () => addFile() },
            { label: "New tag…", onSelect: () => addTag() },
          ])
        }
        onDragOver={(event) => {
          if (!dragPath) return;
          event.preventDefault();
          setDropTarget("");
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragPath) moveToFolder(dragPath, "");
        }}
      >
        {renderDraftRow(undefined, 0)}
        {renderNode(tree, 0)}
      </div>
      <div className={styles.explorerFoot}>
        <span className={styles.explorerActions}>
          <button type="button" onClick={() => addFunction()}>+ function</button>
          <button type="button" onClick={() => addFile()}>+ file</button>
          <button type="button" onClick={() => addTag()}>+ tag</button>
          <button type="button" onClick={() => addPack()}>+ pack</button>
        </span>
        <span>{formatPackFormat(version.packFormat)}</span>
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* Code                                                               */
/* ------------------------------------------------------------------ */
export function CodePanel({ panelApi }: { panelApi?: DockviewPanelApi }) {
  const project = useWorkbench((state) => state.project);
  const activePath = useWorkbench((state) => state.activePath);
  const openTabs = useWorkbench((state) => state.openTabs);
  const openFile = useWorkbench((state) => state.openFile);
  const closeTab = useWorkbench((state) => state.closeTab);
  const updateFile = useWorkbench((state) => state.updateFile);
  const runActive = useWorkbench((state) => state.runActive);
  const showToast = useWorkbench((state) => state.showToast);
  const content = project.files[activePath];
  const tabs = openTabs.filter((path) => path in project.files);

  useEffect(() => {
    panelApi?.setTitle("Code");
  }, [panelApi]);

  const runnable = activePath.endsWith(".mcfunction");
  return (
    <div className={`${styles.panel} ${styles.editorPanel}`}>
      {tabs.length > 0 && (
        <div className={styles.editorTabs} role="tablist" aria-label="Open files">
          {tabs.map((path) => (
            <div
              key={path}
              className={`${styles.editorTab} ${path === activePath ? styles.editorTabActive : ""}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={path === activePath}
                className={styles.editorTabMain}
                title={path}
                onClick={() => openFile(path)}
              >
                {displayNameForFile(path)}
              </button>
              <button
                type="button"
                className={styles.editorTabClose}
                aria-label={`Close ${path}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(path);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {!activePath || content === undefined ? (
        <EmptyState
          title="Nothing open"
          body="Pick a file in the Explorer, or create one from the File menu."
        />
      ) : (
        <div className={styles.editorHost}>
          <CodeEditor
            key={activePath}
            path={activePath}
            value={content}
            onChange={(next) => updateFile(activePath, next)}
            onRun={runActive}
            onSave={() => showToast("Saved to this browser", "success")}
          />
          <button
            type="button"
            className={styles.editorRun}
            onClick={runActive}
            disabled={!runnable}
            title={runnable ? "Run active function" : "Only functions can run"}
          >
            <span aria-hidden>▶</span> Run file
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview                                                            */
/* ------------------------------------------------------------------ */
export function PreviewPanel() {
  const { sim, world, revision } = useWorldSnapshot();
  const selected = useWorkbench((state) => state.selectedEntity);
  const selectEntity = useWorkbench((state) => state.selectEntity);
  const requestPanel = useWorkbench((state) => state.requestPanel);
  const runCommand = useWorkbench((state) => state.runCommand);
  const runLoad = useWorkbench((state) => state.runLoad);
  const showToast = useWorkbench((state) => state.showToast);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const previewMenu = (event: React.MouseEvent, entity: EntityData | null) => {
    const items: ContextMenuEntry[] = [];
    if (entity) {
      const pos = entityPos(entity);
      items.push(
        {
          label: "Inspect entity",
          onSelect: () => {
            selectEntity(entity.uuid);
            requestPanel("entities");
          },
        },
        {
          label: "Teleport player here",
          onSelect: () => runCommand(`tp @s ${pos.x} ${pos.y} ${pos.z}`),
        },
        { separator: true },
        {
          label: "Copy UUID",
          onSelect: () => {
            copyText(entity.uuid);
            showToast("UUID copied", "success");
          },
        },
        {
          label: "Copy position",
          onSelect: () => {
            copyText(`${pos.x} ${pos.y} ${pos.z}`);
            showToast("Position copied", "success");
          },
        },
        {
          label: "Copy NBT",
          onSelect: () => {
            copyText(stringifySnbt(entity.nbt));
            showToast("Entity NBT copied", "success");
          },
        },
      );
    } else {
      const player = world.player();
      items.push(
        { label: "Run /reload", onSelect: runLoad },
        {
          label: "Open entities",
          onSelect: () => requestPanel("entities"),
        },
      );
      if (player) {
        const pos = entityPos(player);
        items.push({
          label: "Copy player position",
          onSelect: () => {
            copyText(`${pos.x} ${pos.y} ${pos.z}`);
            showToast("Player position copied", "success");
          },
        });
      }
    }
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  };

  return (
    <div className={`${styles.panel} ${styles.previewPanel}`}>
      <div className={styles.previewBody}>
        <WorldView
          world={world}
          revision={revision}
          interactive
          selected={selected}
          onSelect={selectEntity}
          onContextMenu={previewMenu}
        />
      </div>
      <div className={styles.panelFoot}>
        <span>{sim.version.id}</span>
        <span>{world.entities.length} {world.entities.length === 1 ? "entity" : "entities"}</span>
        <span>{world.titles.title ? "title active" : "no title"}</span>
        <span className={styles.panelFootRight}>drag · zoom · right-drag rotate</span>
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Console                                                            */
/* ------------------------------------------------------------------ */
export function ConsolePanel() {
  const { sim, world, revision } = useWorldSnapshot();
  const runCommand = useWorkbench((state) => state.runCommand);
  const clearConsole = useWorkbench((state) => state.clearConsole);
  const recent = useWorkbench((state) => state.recentCommands);
  const [value, setValue] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [revision, world.logs.length]);

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const command = value.trim();
    if (!command) return;
    runCommand(command);
    setValue("");
    setHistoryIndex(-1);
  };

  const history = (direction: number) => {
    if (recent.length === 0) return;
    const next = Math.max(0, Math.min(recent.length - 1, historyIndex + direction));
    setHistoryIndex(next);
    setValue(recent[next] ?? "");
  };

  const logs = world.logs;

  return (
    <div className={`${styles.panel} ${styles.consolePanel}`}>
      <div className={styles.consoleBody}>
        <div className={styles.consoleOut} ref={scrollRef}>
          {logs.length === 0 && (
            <div className={styles.consoleWelcome}>
              <span>cmdlib console · {sim.version.id}</span>
              <p>Type a Minecraft command below.</p>
            </div>
          )}
          {logs.map((entry) => (
            <div key={entry.id} className={`${styles.logLine} ${styles[`log_${entry.kind}`]}`}>
              <span className={styles.logMark}>
                {entry.kind === "command"
                  ? "›"
                  : entry.kind === "error"
                    ? "×"
                    : entry.kind === "data"
                      ? "≡"
                      : entry.kind === "system"
                        ? "—"
                        : "·"}
              </span>
              <span className={styles.logText}>{entry.text}</span>
            </div>
          ))}
        </div>
        <form className={styles.consoleForm} onSubmit={submit}>
          <span className={styles.consolePrompt}>/</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                history(-1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                history(1);
              }
            }}
            placeholder="say hello"
            spellCheck={false}
            aria-label="Minecraft command"
            autoComplete="off"
          />
          <button type="submit" className={styles.consoleRun}>Run</button>
          <button type="button" className={styles.consoleClear} onClick={clearConsole}>clear</button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scoreboards                                                        */
/* ------------------------------------------------------------------ */
export function ScoreboardPanel() {
  const { world, revision } = useWorldSnapshot();
  const objectives = useMemo(() => [...world.objectives.values()], [world, revision]);
  const sidebarObjective = world.displaySlots.get("sidebar") ?? null;
  const [selected, setSelected] = useState<string | null>(sidebarObjective ?? objectives[0]?.name ?? null);

  useEffect(() => {
    if (selected && world.objectives.has(selected)) return;
    setSelected(sidebarObjective ?? objectives[0]?.name ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, sidebarObjective]);

  const objective = selected ? world.objectives.get(selected) : null;
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const scores = useMemo(() => {
    if (!selected) return [];
    const map = world.scores.get(selected);
    if (!map) return [];
    return [...map.entries()]
      .map(([holder, value]) => ({ holder, value, display: world.holderDisplayName(holder) }))
      .sort((a, b) => b.value - a.value || a.holder.localeCompare(b.holder));
  }, [world, selected, revision]);
  const pageCount = Math.max(1, Math.ceil(scores.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageScores = scores.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [selected]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  return (
    <PanelShell
      title="Scoreboards"
      subtitle={`${objectives.length} objectives`}
      actions={<span className={styles.monoTag}>live</span>}
      footer={
        <>
          <span>sidebar: {sidebarObjective ?? "none"}</span>
          <span>{scores.length} scores</span>
          {scores.length > PAGE_SIZE && (
            <span className={styles.pager}>
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                aria-label="Previous score page"
              >
                ‹
              </button>
              <span>{currentPage + 1} / {pageCount}</span>
              <button
                type="button"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                aria-label="Next score page"
              >
                ›
              </button>
            </span>
          )}
        </>
      }
    >
      {objectives.length === 0 ? (
        <EmptyState title="No objectives yet" body="Run /reload, or add a scoreboard objective in a function." />
      ) : (
        <div className={styles.scoreboard}>
          <div className={styles.objectiveList}>
            {objectives.map((entry) => {
              const slot = [...world.displaySlots.entries()].find(([, value]) => value === entry.name)?.[0];
              return (
                <button
                  key={entry.name}
                  type="button"
                  className={`${styles.objectiveRow} ${selected === entry.name ? styles.objectiveRowActive : ""}`}
                  onClick={() => setSelected(entry.name)}
                >
                  <span>
                    <b>{world.plain(entry.displayName) || entry.name}</b>
                    <em>{entry.name} · {entry.criterion}</em>
                  </span>
                  {slot && <span className={styles.slotBadge}>{slot}</span>}
                </button>
              );
            })}
          </div>
          {objective && (
            <div className={styles.scoreTable}>
              <div className={styles.scoreTableHead}>
                <span>{objective.name}</span>
                <span>{objective.renderType}</span>
              </div>
              {scores.length === 0 && <p className={styles.scoreEmpty}>No scores set.</p>}
              {pageScores.map((score) => (
                <div key={score.holder} className={styles.scoreRow}>
                  <span className={styles.scoreName}>{score.display}</span>
                  <span className={styles.scoreHolder}>{score.holder.slice(0, 8)}</span>
                  <b>{score.value}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/* ------------------------------------------------------------------ */
export function StoragePanel() {
  const { world, revision } = useWorldSnapshot();
  const project = useWorkbench((state) => state.project);
  const showToast = useWorkbench((state) => state.showToast);
  const ids = useMemo(
    () => [...new Set([...collectStorageIds(project.files), ...world.storages.keys()])].sort(),
    [project.files, world, revision],
  );
  const [selected, setSelected] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (selected && world.storages.has(selected)) return;
    setSelected(ids[0] ?? null);
  }, [ids, world, selected]);

  const compound = selected ? world.storages.get(selected) : undefined;

  return (
    <PanelShell
      title="Storage"
      subtitle="data storage"
      actions={
        <button
          type="button"
          className={styles.textButton}
          disabled={!compound}
          onClick={() => {
            if (!compound) return;
            copyText(stringifySnbt(compound, { pretty: true }));
            showToast("Storage NBT copied", "success");
          }}
        >
          Copy NBT
        </button>
      }
      footer={<span>{ids.length} namespaces</span>}
    >
      {ids.length === 0 ? (
        <EmptyState title="No storage written yet" body="Run the load tag, or write with /data modify storage …" />
      ) : (
        <div className={styles.storage}>
          <div className={styles.storageList}>
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.storageRow} ${selected === id ? styles.storageRowActive : ""}`}
                onClick={() => setSelected(id)}
              >
                <span>{id}</span>
                <em>{world.storages.has(id) ? "live" : "idle"}</em>
              </button>
            ))}
          </div>
          <div className={styles.storageBody}>
            {compound ? (
              <NbtTree tag={compound} name={selected ?? "storage"} defaultOpen={1} />
            ) : (
              <p className={styles.storageEmpty}>This storage has not been created yet. Run the pack or write to it.</p>
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/* Entities                                                           */
/* ------------------------------------------------------------------ */
export function EntitiesPanel() {
  const { world, revision } = useWorldSnapshot();
  const selected = useWorkbench((state) => state.selectedEntity);
  const selectEntity = useWorkbench((state) => state.selectEntity);
  const entities = useMemo(
    () =>
      [...world.entities].sort((a, b) => {
        const pa = entityPos(a);
        const pb = entityPos(b);
        return a.isPlayer ? -1 : b.isPlayer ? 1 : pa.x + pa.z - (pb.x + pb.z);
      }),
    [world, revision],
  );
  const entity = selected ? world.entityByUuid(selected) : undefined;
  const player = world.player();
  const gameMode = player ? world.playerGameMode(player) : "survival";
  const inventory = player ? world.playerInventory(player) : [];
  const effects = player ? world.effectsOf(player) : [];
  const triggers = player
    ? [...(world.playerState(player)?.enabledTriggers ?? [])]
    : [];

  return (
    <div className={`${styles.panel} ${styles.entitiesPanel}`}>
      <div className={styles.panelBar}>
        <span className={styles.panelSubtitle}>{entities.length} entities · static</span>
        {selected && (
          <button type="button" className={styles.textButton} onClick={() => selectEntity(null)}>
            clear
          </button>
        )}
      </div>
      {player && (
        <div className={styles.playerRuntime}>
          <div className={styles.playerRuntimeLine}>
            <span className={styles.playerRuntimeLabel}>player</span>
            <b>{entityCustomName(player)}</b>
            <span className={styles.playerMode}>{gameMode}</span>
            <span className={styles.playerRuntimeCount}>
              {inventory.length} stack{inventory.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className={styles.playerRuntimeLine}>
            <span className={styles.playerRuntimeLabel}>inventory</span>
            {inventory.length === 0 && <span className={styles.playerRuntimeMuted}>empty</span>}
            {inventory.slice(0, 8).map((item) => (
              <span key={`${item.id}-${item.count}`} className={styles.playerChip}>
                {item.id.replace("minecraft:", "")} ×{item.count}
              </span>
            ))}
            {inventory.length > 8 && (
              <span className={styles.playerRuntimeMuted}>+{inventory.length - 8} more</span>
            )}
          </div>
          {(effects.length > 0 || triggers.length > 0) && (
            <div className={styles.playerRuntimeLine}>
              <span className={styles.playerRuntimeLabel}>state</span>
              {effects.map((effect) => (
                <span key={effect.id} className={styles.playerChip}>
                  {effect.id.replace("minecraft:", "")} {effect.amplifier + 1} ·{" "}
                  {Math.ceil(effect.durationTicks / 20)}s
                </span>
              ))}
              {triggers.map((objective) => (
                <span key={objective} className={styles.playerChip}>
                  trigger:{objective}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={styles.entitiesBody}>
        <div className={styles.entityList}>
          {entities.map((entry) => {
            const info = entityInfo(entry.type);
            const pos = entityPos(entry);
            return (
              <button
                key={entry.uuid}
                type="button"
                className={`${styles.entityRow} ${selected === entry.uuid ? styles.entityRowActive : ""}`}
                onClick={() => selectEntity(entry.uuid)}
              >
                <span className={styles.entitySwatch} style={{ background: info.color }} />
                <span className={styles.entityName}>
                  <b>{entityCustomName(entry)}</b>
                  <em>{entry.type.replace("minecraft:", "")}</em>
                </span>
                <span className={styles.entityPos}>
                  {pos.x.toFixed(1)} {pos.y.toFixed(1)} {pos.z.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.entityInspector}>
          {entity ? (
            <>
              <div className={styles.entityInspectorHead}>
                <span>{entityCustomName(entity)}</span>
                <span className={styles.monoTag}>{entity.uuid.slice(0, 8)}</span>
              </div>
              <div className={styles.nbtScroll}>
                <NbtTree tag={entity.nbt} defaultOpen={1} />
              </div>
            </>
          ) : (
            <p className={styles.entityHint}>Select an entity to inspect its NBT. Positions are stored in <code>Pos</code>, exactly like the game.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Problems                                                           */
/* ------------------------------------------------------------------ */
type SeverityFilter = "all" | "error" | "warning" | "info";

export function ProblemsPanel() {
  const report = useWorkbench((state) => state.lintReport);
  const refreshLint = useWorkbench((state) => state.refreshLint);
  const goTo = useWorkbench((state) => state.goTo);
  const applyQuickFix = useWorkbench((state) => state.applyQuickFix);
  const showToast = useWorkbench((state) => state.showToast);
  const [filter, setFilter] = useState<SeverityFilter>("all");

  // Unused functions are surfaced on the Explorer file row, not here.
  const visibleDiagnostics = report.diagnostics.filter(
    (entry) => entry.code !== "unused-function",
  );

  const diagnostics = visibleDiagnostics.filter((entry) =>
    filter === "all"
      ? true
      : filter === "info"
        ? entry.severity === "info" || entry.severity === "hint"
        : entry.severity === filter,
  );

  const grouped = useMemo(() => {
    const map = new Map<string, LintDiagnostic[]>();
    for (const diagnostic of diagnostics) {
      const list = map.get(diagnostic.path) ?? [];
      list.push(diagnostic);
      map.set(diagnostic.path, list);
    }
    return [...map.entries()];
  }, [diagnostics]);

  return (
    <PanelShell
      title="Problems"
      subtitle={`${report.errors} errors · ${report.warnings} warnings · ${report.durationMs} ms`}
      actions={
        <>
          <button type="button" className={styles.textButton} onClick={() => refreshLint()}>Re-lint</button>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              copyText(JSON.stringify(toLspDiagnostics(report.diagnostics), null, 2));
              showToast("LSP diagnostics copied", "success");
            }}
          >
            Copy LSP
          </button>
        </>
      }
      footer={
        <>
          <span>{report.filesLinted} files linted</span>
          <span>{report.versionId}</span>
        </>
      }
    >
      <div className={styles.filterRow}>
        {(["all", "error", "warning", "info"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`${styles.filterChip} ${filter === value ? styles.filterChipActive : ""}`}
            onClick={() => setFilter(value)}
          >
            {value} <span>{value === "all" ? visibleDiagnostics.length : visibleDiagnostics.filter((d) => d.severity === value).length}</span>
          </button>
        ))}
      </div>
      <div className={styles.problemsList}>
        {grouped.length === 0 && (
          <EmptyState title="No problems" body="The pack parses, the objectives resolve and the version profile is happy. Ship it." />
        )}
        {grouped.map(([path, items]) => (
          <section key={path} className={styles.problemGroup}>
            <button type="button" className={styles.problemFile} onClick={() => goTo(path, 1)}>
              <span className={styles.fileIcon}>ƒ</span>
              {path}
              <span>{items.length}</span>
            </button>
            {items.map((diagnostic) => (
              <button
                key={diagnostic.id}
                type="button"
                className={`${styles.problemRow} ${styles[`problem_${diagnostic.severity}`]}`}
                onClick={() => goTo(diagnostic.path, diagnostic.line, diagnostic.column)}
              >
                <span className={styles.problemIcon}>
                  {diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}
                </span>
                <span className={styles.problemBody}>
                  <span className={styles.problemLine}>
                    {diagnostic.line}:{diagnostic.column}
                    <code>{diagnostic.code}</code>
                  </span>
                  <span>{diagnostic.message}</span>
                </span>
                {diagnostic.quickFix?.[0] && (
                  <span
                    className={styles.problemFix}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      applyQuickFix(diagnostic.quickFix![0]);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.stopPropagation();
                        applyQuickFix(diagnostic.quickFix![0]);
                      }
                    }}
                  >
                    fix
                  </span>
                )}
              </button>
            ))}
          </section>
        ))}
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/* Reference                                                          */
/* ------------------------------------------------------------------ */
export function ReferencePanel() {
  const project = useWorkbench((state) => state.project);
  const version = getVersion(project.versionId);
  const [query, setQuery] = useState("");
  const [onlySimulated, setOnlySimulated] = useState(false);
  const [selected, setSelected] = useState("scoreboard");

  const names = COMMAND_NAMES.filter((name) => {
    const spec = COMMANDS[name];
    if (onlySimulated && !spec.supported) return false;
    if (!query) return true;
    return name.includes(query.toLowerCase()) || spec.summary.toLowerCase().includes(query.toLowerCase());
  });
  const spec = COMMANDS[selected] ?? COMMANDS[names[0]];

  return (
    <PanelShell
      title="Reference"
      subtitle="26.3 command tree"
      actions={
        <label className={styles.checkbox}>
          <input type="checkbox" checked={onlySimulated} onChange={(event) => setOnlySimulated(event.target.checked)} />
          simulated only
        </label>
      }
      footer={
        <>
          <span>{names.length} commands</span>
          <span>source: 26.3 grammar</span>
        </>
      }
    >
      <div className={styles.reference}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands…"
          aria-label="Search commands"
        />
        <div className={styles.referenceBody}>
          <div className={styles.referenceList}>
            {names.map((name) => (
              <button
                key={name}
                type="button"
                className={`${styles.referenceRow} ${selected === name ? styles.referenceRowActive : ""}`}
                onClick={() => setSelected(name)}
              >
                <span>/{name}</span>
                <em>{COMMANDS[name].supported ? "runtime" : "lint only"}</em>
              </button>
            ))}
          </div>
          {spec && (
            <div className={styles.referenceDetail}>
              <div className={styles.referenceTitle}>
                <h3>/{spec.name}</h3>
                <span className={spec.supported ? styles.runtimeBadge : styles.lintBadge}>
                  {spec.supported ? "simulated" : "recognised, not simulated"}
                </span>
              </div>
              <p>{spec.summary}</p>
              {spec.usage && <pre>{spec.usage}</pre>}
              {spec.args && (
                <ul className={styles.referenceArgs}>
                  {spec.args.map((arg) => (
                    <li key={arg.name}>
                      <code>{arg.name}</code>
                      <span>{arg.type}</span>
                      {arg.description && <em>{arg.description}</em>}
                    </li>
                  ))}
                </ul>
              )}
              {spec.children && (
                <p className={styles.referenceHint}>
                  Subcommands: {Object.keys(spec.children).map((name) => `/${spec.name} ${name}`).join(" · ")}
                </p>
              )}
              <a
                className={styles.referenceLink}
                href={`https://minecraft.wiki/w/Commands/${spec.name}`}
                target="_blank"
                rel="noreferrer"
              >
                Minecraft Wiki · /{spec.name} ↗
              </a>
            </div>
          )}
        </div>
        <p className={styles.referenceFoot}>
          {version.id} · pack format {formatPackFormat(version.packFormat)} · {version.textComponents.toUpperCase()} components
        </p>
      </div>
    </PanelShell>
  );
}

