"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, selectAll, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { createEditorExtensions } from "@/lib/editor/setup";
import { lintProject } from "@/lib/lint";
import { getVersion } from "@/lib/mc/version";
import { useCompletionIndex, useWorkbench } from "@/lib/state/workbench";
import type { CompletionIndex } from "@/lib/editor/completions";

export function CodeEditor({
  path,
  value,
  onChange,
  onRun,
  onSave,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const index = useCompletionIndex();
  const indexRef = useRef<CompletionIndex>(index);
  indexRef.current = index;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const pathRef = useRef(path);
  pathRef.current = path;
  const goto = useWorkbench((state) => state.goto);
  const goTo = useWorkbench((state) => state.goTo);
  const applyQuickFix = useWorkbench((state) => state.applyQuickFix);
  const setCursor = useWorkbench((state) => state.setCursor);
  const isJson = path.endsWith(".json") || path.endsWith(".mcmeta");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const extensions = createEditorExtensions(
      {
        getIndex: () => indexRef.current,
        lint: (content) => {
          const state = useWorkbench.getState();
          const project = {
            ...state.project,
            files: { ...state.project.files, [pathRef.current]: content },
          };
          const report = lintProject(project, {
            onlyPaths: [pathRef.current],
            version: getVersion(project.versionId),
          });
          return { diagnostics: report.diagnostics, report };
        },
        onRun: () => onRunRef.current(),
        onSave: () => onSaveRef.current(),
        onQuickFix: (fix) => applyQuickFix(fix),
      },
      isJson ? "json" : "mcfunction",
    );

    const state = EditorState.create({
      doc: value,
      extensions: [
        ...extensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            setCursor(line.number, head - line.from + 1);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: element });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, isJson]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const handler = (event: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const command = (event as CustomEvent<string>).detail;
      view.focus();
      switch (command) {
        case "undo":
          undo(view);
          break;
        case "redo":
          redo(view);
          break;
        case "find":
          openSearchPanel(view);
          break;
        case "selectAll":
          selectAll(view);
          break;
        case "copy":
        case "cut": {
          const range = view.state.selection.main;
          const text = range.empty
            ? view.state.doc.lineAt(range.head).text
            : view.state.sliceDoc(range.from, range.to);
          void navigator.clipboard?.writeText(text);
          if (command === "cut" && !range.empty) {
            view.dispatch({ changes: { from: range.from, to: range.to, insert: "" } });
          }
          break;
        }
      }
    };
    window.addEventListener("cmdlib:editor-command", handler);
    return () => window.removeEventListener("cmdlib:editor-command", handler);
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !goto || goto.path !== path) return;
    const line = view.state.doc.line(Math.min(goto.line, view.state.doc.lines));
    const position = Math.min(line.to, line.from + Math.max(0, goto.column - 1));
    view.dispatch({
      selection: { anchor: position, head: position },
      scrollIntoView: true,
    });
    view.focus();
  }, [goto, path]);

  return <div className="editor-host" ref={host} onClick={() => viewRef.current?.focus()} />;
}

export function jumpToLine(path: string, line: number, column = 1): void {
  useWorkbench.getState().goTo(path, line, column);
}
