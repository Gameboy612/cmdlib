"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench, useSimRevision, functionPathOf } from "@/lib/state/workbench";
import { WorldView } from "@/components/preview/WorldView";
import { CodeEditor } from "./CodeEditor";
import { NbtTree } from "./NbtTree";
import {
  collectStorageIds,
  displayNameForFile,
  fileKind,
} from "@/lib/mc/datapack";
import { getVersion, VERSIONS, formatPackFormat } from "@/lib/mc/version";
import { COMMANDS, COMMAND_NAMES, entityInfo } from "@/lib/mc/data";
import { entityCustomName, entityPos } from "@/lib/mc/entities";
import { stringifySnbt } from "@/lib/mc/nbt";
import { toLspDiagnostics, type Diagnostic as LintDiagnostic } from "@/lib/lint";
import { copyText } from "@/lib/io";
import { useWorkspace } from "./WorkspaceContext";
import styles from "./editor.module.css";
import { asset } from "@/lib/base-path";

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
    <div className={`${styles.panel} ${className}`}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <span>{title}</span>
          {subtitle && <span className={styles.panelSubtitle}>{subtitle}</span>}
        </div>
        {actions && <div className={styles.panelActions}>{actions}</div>}
      </div>
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

export function ExplorerPanel() {
  const project = useWorkbench((state) => state.project);
  const activePath = useWorkbench((state) => state.activePath);
  const openFile = useWorkbench((state) => state.openFile);
  const createFile = useWorkbench((state) => state.createFile);
  const deleteFile = useWorkbench((state) => state.deleteFile);
  const renameFile = useWorkbench((state) => state.renameFile);
  const showToast = useWorkbench((state) => state.showToast);
  const version = getVersion(project.versionId);
  const tree = useMemo(() => buildTree(project.files), [project.files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const addFunction = () => {
    const raw = window.prompt("New function name (without .mcfunction)", "new_function");
    if (!raw) return;
    const name = raw
      .trim()
      .replace(/^data\/.+\//, "")
      .replace(/\.mcfunction$/, "")
      .replace(/\s+/g, "_");
    if (!name) return;
    const path = `data/${activeNamespace}/${version.functionFolder}/${name}.mcfunction`;
    createFile(path, `# ${activeNamespace}:${name}\n`);
  };

  const addTag = () => {
    const raw = window.prompt("New function tag name", "tick");
    if (!raw) return;
    const name = raw.trim().replace(/\s+/g, "_").replace(/\.json$/, "");
    if (!name) return;
    const path = `data/${activeNamespace}/${version.tagFolder}/${name}.json`;
    createFile(path, `${JSON.stringify({ values: [] }, null, 2)}\n`);
  };

  const addFile = () => {
    const raw = window.prompt("Full path inside the pack", "data/cmdlib/function/utility.mcfunction");
    if (!raw) return;
    createFile(raw.trim(), raw.endsWith(".json") ? "{}\n" : "");
  };

  const remove = (path: string) => {
    if (!window.confirm(`Delete ${path}?`)) return;
    deleteFile(path);
  };

  const rename = (path: string) => {
    const next = window.prompt("New path", path);
    if (!next || next === path) return;
    renameFile(path, next.trim());
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.file) {
      const kind = fileKind(node.path);
      const isActive = activePath === node.path;
      return (
        <div
          key={node.path}
          className={`${styles.treeRow} ${isActive ? styles.treeRowActive : ""}`}
          style={{ paddingLeft: 8 + depth * 13 }}
          onClick={() => openFile(node.path)}
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
          <span className={styles.treeActions}>
            <button type="button" aria-label={`Rename ${node.path}`} onClick={(event) => { event.stopPropagation(); rename(node.path); }}>
              ✎
            </button>
            <button type="button" aria-label={`Delete ${node.path}`} onClick={(event) => { event.stopPropagation(); remove(node.path); }}>
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
            className={styles.treeFolder}
            style={{ paddingLeft: 8 + depth * 13 }}
            onClick={() => toggle(node.path)}
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
    <PanelShell
      title="Explorer"
      subtitle={`${Object.keys(project.files).length} files`}
      actions={
        <>
          <button type="button" className={styles.iconButton} title="New function" onClick={addFunction}>+ƒ</button>
          <button type="button" className={styles.iconButton} title="New file" onClick={addFile}>+</button>
        </>
      }
      footer={
        <div className={styles.explorerFoot}>
          <button type="button" onClick={addFunction}>+ function</button>
          <button type="button" onClick={addTag}>+ tag</button>
        </div>
      }
    >
      <div className={styles.packMeta}>
        <span className={styles.packDot} />
        <span className={styles.packName}>{project.name}</span>
        <span className={styles.packVersion}>{version.id}</span>
      </div>
      <div className={styles.tree}>{renderNode(tree, 0)}</div>
      <div className={styles.explorerHint}>
        <span>Autosaved to this browser</span>
        <span>{formatPackFormat(version.packFormat)}</span>
      </div>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ */
/* Code                                                               */
/* ------------------------------------------------------------------ */
export function CodePanel() {
  const project = useWorkbench((state) => state.project);
  const activePath = useWorkbench((state) => state.activePath);
  const openTabs = useWorkbench((state) => state.openTabs);
  const openFile = useWorkbench((state) => state.openFile);
  const closeTab = useWorkbench((state) => state.closeTab);
  const updateFile = useWorkbench((state) => state.updateFile);
  const runActive = useWorkbench((state) => state.runActive);
  const showToast = useWorkbench((state) => state.showToast);
  const version = getVersion(project.versionId);
  const content = project.files[activePath];
  const fnId = activePath ? functionPathOf(activePath, project.versionId) : null;

  if (!activePath || content === undefined) {
    return (
      <PanelShell title="Editor" subtitle="no file open">
        <EmptyState
          title="Nothing open"
          body="Pick a function in the Explorer, or create a new one. F5 runs the load tag."
        />
      </PanelShell>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.editorPanel}`}>
      <div className={styles.editorTabs}>
        {openTabs.map((tab) => (
          <div
            key={tab}
            className={`${styles.editorTab} ${tab === activePath ? styles.editorTabActive : ""}`}
            onClick={() => openFile(tab)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter") openFile(tab);
            }}
          >
            <span className={styles.fileIcon}>{tab.endsWith(".json") || tab.endsWith(".mcmeta") ? "{}" : "ƒ"}</span>
            <span>{displayNameForFile(tab)}</span>
            <button
              type="button"
              aria-label={`Close ${tab}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className={styles.editorBreadcrumb}>
        <span className={styles.crumbPath}>{activePath.split("/").slice(0, -1).join(" / ")}</span>
        <span className={styles.crumbName}>{displayNameForFile(activePath)}</span>
        {fnId && <span className={styles.crumbId}>{fnId}</span>}
        <span className={styles.crumbVersion}>{version.id}</span>
      </div>
      <div className={styles.editorHost}>
        <CodeEditor
          key={activePath}
          path={activePath}
          value={content}
          onChange={(next) => updateFile(activePath, next)}
          onRun={runActive}
          onSave={() => showToast("Saved to this browser", "success")}
        />
      </div>
      <div className={styles.editorFoot}>
        <span><kbd>Ctrl</kbd> <kbd>Space</kbd> complete</span>
        <span><kbd>Ctrl</kbd> <kbd>Enter</kbd> run function</span>
        <span><kbd>Ctrl</kbd> <kbd>K</kbd> palette</span>
        <span className={styles.editorFootRight}>mcfunction · {version.functionFolder}/</span>
      </div>
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
  const runDemo = useWorkbench((state) => state.runDemo);
  const { openPanel } = useWorkspace();

  return (
    <div className={`${styles.panel} ${styles.previewPanel}`}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <span>World preview</span>
          <span className={styles.panelSubtitle}>{world.entities.length} entities · no AI</span>
        </div>
        <div className={styles.panelActions}>
          <button type="button" className={styles.textButton} onClick={() => openPanel("entities")}>
            Inspect
          </button>
          <button type="button" className={styles.textButton} onClick={runDemo}>
            Run demo
          </button>
        </div>
      </div>
      <div className={styles.previewBody}>
        <WorldView
          world={world}
          revision={revision}
          interactive
          selected={selected}
          onSelect={selectEntity}
        />
      </div>
      <div className={styles.panelFoot}>
        <span>{sim.version.label}</span>
        <span>{world.entities.length} entities</span>
        <span>{world.titles.title ? "title active" : "no title"}</span>
        <span className={styles.panelFootRight}>drag · zoom · click</span>
      </div>
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
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <span>Console</span>
          <span className={styles.panelSubtitle}>source: {world.player() ? entityCustomName(world.player()!) : "server"}</span>
        </div>
        <div className={styles.panelActions}>
          <button type="button" className={styles.textButton} onClick={clearConsole}>Clear</button>
          <span className={styles.consoleStatus}><span className="dot" /> running</span>
        </div>
      </div>
      <div className={styles.consoleBody}>
        <div className={styles.consoleOut} ref={scrollRef}>
          {logs.length === 0 && (
            <div className={styles.consoleWelcome}>
              <span>cmdlib console · {sim.version.id}</span>
              <p>Type a command. Try <code>/function cmdlib:demo</code> or <code>/data get storage cmdlib:board</code>.</p>
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
        <div className={styles.consoleHints}>
          {[
            "function cmdlib:demo",
            "data get storage cmdlib:board quest",
            "scoreboard players get @s points",
          ].map((hint) => (
            <button key={hint} type="button" onClick={() => setValue(hint)}>
              {hint}
            </button>
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
            placeholder="scoreboard players set @s points 100"
            spellCheck={false}
            aria-label="Minecraft command"
            autoComplete="off"
          />
          <button type="submit" className={styles.consoleRun}>Run ↵</button>
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
  const scores = useMemo(() => {
    if (!selected) return [];
    const map = world.scores.get(selected);
    if (!map) return [];
    return [...map.entries()]
      .map(([holder, value]) => ({ holder, value, display: world.holderDisplayName(holder) }))
      .sort((a, b) => b.value - a.value || a.holder.localeCompare(b.holder));
  }, [world, selected, revision]);

  return (
    <PanelShell
      title="Scoreboards"
      subtitle={`${objectives.length} objectives`}
      actions={<span className={styles.monoTag}>live</span>}
      footer={
        <>
          <span>sidebar: {sidebarObjective ?? "none"}</span>
          <span>{scores.length} scores</span>
        </>
      }
    >
      {objectives.length === 0 ? (
        <EmptyState title="No objectives yet" body="Press F5 to run the pack's load tag, or add a scoreboard objective in a function." />
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
              {scores.map((score) => (
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

  return (
    <div className={`${styles.panel} ${styles.entitiesPanel}`}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <span>Entities</span>
          <span className={styles.panelSubtitle}>{entities.length} in world · static</span>
        </div>
        <div className={styles.panelActions}>
          {selected && <button type="button" className={styles.textButton} onClick={() => selectEntity(null)}>Clear</button>}
        </div>
      </div>
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

  const diagnostics = report.diagnostics.filter((entry) =>
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
            {value} <span>{value === "all" ? report.diagnostics.length : report.diagnostics.filter((d) => d.severity === value).length}</span>
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

