"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkbench } from "@/lib/state/workbench";
import { asset } from "@/lib/base-path";
import { ContextMenu, type ContextMenuEntry, type ContextMenuState } from "@/components/ui/ContextMenu";
import styles from "./projects.module.css";

export function ProjectsPage() {
  const router = useRouter();
  const projects = useWorkbench((state) => state.projects);
  const activeProjectId = useWorkbench((state) => state.activeProjectId);
  const hydrated = useWorkbench((state) => state.hydrated);
  const hydrate = useWorkbench((state) => state.hydrate);
  const createProject = useWorkbench((state) => state.createProject);
  const openProject = useWorkbench((state) => state.openProject);
  const deleteProject = useWorkbench((state) => state.deleteProject);
  const renameProject = useWorkbench((state) => state.renameProject);
  const addPack = useWorkbench((state) => state.addPack);
  const selectPack = useWorkbench((state) => state.selectPack);
  const renamePackInProject = useWorkbench((state) => state.renamePackInProject);
  const deletePackInProject = useWorkbench((state) => state.deletePackInProject);
  const importGithubProject = useWorkbench((state) => state.importGithubProject);
  const importProjectZip = useWorkbench((state) => state.importProjectZip);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [importingProject, setImportingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const projectInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const open = (id: string) => {
    openProject(id);
    router.push("/editor/");
  };

  const newProject = () => {
    const name = window.prompt("Project name", "Untitled Project");
    if (name === null) return;
    createProject(name.trim() || undefined);
    router.push("/editor/");
  };

  const addPackTo = (id: string) => {
    openProject(id);
    addPack();
    router.push("/editor/");
  };

  const rename = (id: string, current: string) => {
    const name = window.prompt("Project name", current);
    if (name === null) return;
    renameProject(id, name);
  };

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Delete project “${name}” and all of its packs?`)) return;
    deleteProject(id);
  };

  const openMenu = (event: React.MouseEvent, items: ContextMenuEntry[]) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, items });
  };

  const projectMenu = (event: React.MouseEvent, project: (typeof projects)[number]) => {
    openMenu(event, [
      { label: "Open project", onSelect: () => open(project.id) },
      { label: "Add pack", onSelect: () => addPackTo(project.id) },
      {
        label: "Rename project…",
        onSelect: () => rename(project.id, project.name),
      },
      {
        label: "Copy project name",
        onSelect: () => {
          void navigator.clipboard?.writeText(project.name);
        },
      },
      ...(project.githubUrl
        ? [{ label: "Open on GitHub", onSelect: () => window.open(project.githubUrl, "_blank", "noreferrer") }]
        : []),
      { separator: true },
      {
        label: "Delete project",
        danger: true,
        onSelect: () => remove(project.id, project.name),
      },
    ]);
  };

  const packMenu = (
    event: React.MouseEvent,
    project: (typeof projects)[number],
    pack: (typeof projects)[number]["packs"][number],
  ) => {
    openMenu(event, [
      {
        label: "Open pack",
        onSelect: () => {
          openProject(project.id);
          selectPack(pack.id);
          router.push("/editor/");
        },
      },
      {
        label: "Rename pack…",
        onSelect: () => {
          const name = window.prompt("Pack name", pack.name);
          if (name?.trim()) renamePackInProject(project.id, pack.id, name);
        },
      },
      {
        label: "Copy pack name",
        onSelect: () => {
          void navigator.clipboard?.writeText(pack.name);
        },
      },
      { separator: true },
      {
        label: "Delete pack",
        danger: true,
        disabled: project.packs.length <= 1,
        onSelect: () => {
          if (window.confirm(`Delete ${pack.name}?`)) {
            deletePackInProject(project.id, pack.id);
          }
        },
      },
    ]);
  };

  const importProject = async (file: File) => {
    setImportingProject(true);
    setProjectError(null);
    try {
      await importProjectZip(file);
      router.push("/editor/");
    } catch (cause) {
      setProjectError(
        cause instanceof Error ? cause.message : "Could not import that project",
      );
    } finally {
      setImportingProject(false);
    }
  };

  const importRepo = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!value || importing) return;
    setImporting(true);
    setError(null);
    try {
      await importGithubProject(value);
      setUrl("");
      router.push("/editor/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GitHub import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} title="cmdlib home">
          <img src={asset("/art/mark.svg")} alt="" width={24} height={24} />
          <span>cmdlib</span>
        </Link>
        <span className={styles.crumb}>/ projects</span>
        <div className={styles.topActions}>
          <Link href="/editor/" className={styles.ghostLink}>Back to editor</Link>
          <input
            ref={projectInput}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importProject(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={importingProject}
            onClick={() => projectInput.current?.click()}
          >
            {importingProject ? "Importing…" : "Import project"}
          </button>
          <button type="button" className={styles.primary} onClick={newProject}>
            New project
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Workspace</p>
            <h1>Your projects.</h1>
            <p className={styles.lede}>
              One project can hold several datapacks. Keep a library, a game
              mode, and its resource pack side by side — then open any pack in
              the editor.
            </p>
          </div>
        </section>

        <section className={styles.importCard}>
          <div>
            <p className={styles.eyebrow}>From GitHub</p>
            <h2>Edit a repository locally.</h2>
            <p>
              Paste a public GitHub repository or a folder inside it. Each
              datapack becomes a pack in a new local project.
            </p>
          </div>
          <form className={styles.importForm} onSubmit={importRepo}>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              aria-label="GitHub repository URL"
              spellCheck={false}
            />
            <button type="submit" className={styles.primary} disabled={!url.trim() || importing}>
              {importing ? "Importing…" : "Import"}
            </button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
          <p className={styles.note}>
            Public repositories only. Files are read through the GitHub API and
            stored in this browser; nothing is pushed back.
          </p>
        </section>

        {projectError && <p className={styles.projectError}>{projectError}</p>}
        <section className={styles.list} aria-label="Projects">
          {!hydrated && <p className={styles.empty}>Loading projects…</p>}
          {hydrated && projects.length === 0 && (
            <p className={styles.empty}>No projects yet. Create one to start.</p>
          )}
          {hydrated && projects.map((project) => (
            <article
              key={project.id}
              className={`${styles.card} ${project.id === activeProjectId ? styles.cardActive : ""}`}
              onContextMenu={(event) => projectMenu(event, project)}
            >
              <div className={styles.cardTop}>
                <div>
                  <h2>{project.name}</h2>
                  <span className={styles.meta}>
                    {project.packs.length} pack{project.packs.length === 1 ? "" : "s"}
                    {project.githubUrl ? " · imported" : ""}
                  </span>
                </div>
                {project.id === activeProjectId && <span className={styles.active}>open</span>}
              </div>

              <ul className={styles.packs}>
                {project.packs.map((pack) => (
                  <li
                    key={pack.id}
                    className={pack.id === project.activePackId ? styles.packActive : ""}
                    onContextMenu={(event) => packMenu(event, project, pack)}
                  >
                    <span className={styles.packDot} />
                    <span className={styles.packName}>{pack.name}</span>
                    <span className={styles.packMeta}>
                      {pack.versionId} · {Object.keys(pack.files).length} files
                    </span>
                  </li>
                ))}
              </ul>

              <div className={styles.cardFoot}>
                {project.githubUrl ? (
                  <a href={project.githubUrl} target="_blank" rel="noreferrer" className={styles.github}>
                    GitHub ↗
                  </a>
                ) : (
                  <span className={styles.updated}>
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                )}
                <div className={styles.actions}>
                  <button type="button" onClick={() => addPackTo(project.id)}>+ pack</button>
                  <button type="button" onClick={() => rename(project.id, project.name)}>rename</button>
                  <button type="button" className={styles.danger} onClick={() => remove(project.id, project.name)}>delete</button>
                  <button type="button" className={styles.open} onClick={() => open(project.id)}>open →</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
