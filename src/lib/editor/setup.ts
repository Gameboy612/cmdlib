import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { lintGutter, lintKeymap, linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { createCompletionSource, type CompletionIndex } from "./completions";
import { mcfunctionSupport } from "./language";
import type { Diagnostic, LintQuickFix, LintReport } from "../lint";

export interface EditorCallbacks {
  getIndex: () => CompletionIndex;
  /** Lint only this file, but use the whole project for declarations. */
  lint: (content: string) => { diagnostics: Diagnostic[]; report: LintReport };
  onLint?: (report: LintReport) => void;
  onRun?: () => void;
  onSave?: () => void;
  onQuickFix?: (fix: LintQuickFix) => void;
}

export const cmdlibEditorTheme = EditorView.theme(
  {
    "&": {
      color: "#e6e2d8",
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "13px",
    },
    ".cm-scroller": {
      fontFamily: "var(--mono)",
      lineHeight: "1.7",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "14px 0 30px",
      caretColor: "#ff9368",
    },
    ".cm-line": { padding: "0 18px 0 10px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#4f5560",
      border: "none",
      paddingLeft: "6px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#9aa0ab",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.035)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(255, 147, 104, 0.22)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ff9368" },
    ".cm-panels": {
      backgroundColor: "#111318",
      color: "#e6e2d8",
      borderColor: "#262a32",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(255, 207, 107, 0.22)",
      outline: "1px solid rgba(255, 207, 107, 0.35)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(255, 147, 104, 0.35)",
    },
    ".cm-tooltip": {
      backgroundColor: "#14171d",
      border: "1px solid #2b3039",
      borderRadius: "10px",
      color: "#e6e2d8",
      boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--mono)",
      maxHeight: "260px",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      padding: "5px 10px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "rgba(255, 147, 104, 0.16)",
      color: "#fff7ef",
    },
    ".cm-completionLabel": { fontSize: "12.5px" },
    ".cm-completionDetail": { color: "#7f8794", fontStyle: "normal", marginLeft: "auto" },
    ".cm-completionIcon": { opacity: "0.7" },
    ".cm-diagnostic": {
      fontFamily: "var(--sans)",
      padding: "8px 12px",
      borderLeftWidth: "3px",
    },
    ".cm-diagnostic-error": { borderLeftColor: "#ff6b5e" },
    ".cm-diagnostic-warning": { borderLeftColor: "#ffcf6b" },
    ".cm-diagnostic-info": { borderLeftColor: "#8fd9c8" },
    ".cm-lintRange-error": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 L1.5 1 L3 2.5 L4.5 1 L6 2.5' fill='none' stroke='%23ff6b5e' stroke-width='1'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
    },
    ".cm-lintRange-warning": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2.5 L1.5 1 L3 2.5 L4.5 1 L6 2.5' fill='none' stroke='%23ffcf6b' stroke-width='1'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
    },
    ".cm-lint-marker": { width: "14px", height: "14px" },
    ".cm-foldGutter": { width: "10px" },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(143, 217, 200, 0.16)",
      outline: "1px solid rgba(143, 217, 200, 0.35)",
    },
    ".cm-selectionMatch": { backgroundColor: "rgba(255, 207, 107, 0.14)" },
  },
  { dark: true },
);

/** Tab indents with spaces instead of shifting the whole line. */
function insertTwoSpaces(view: EditorView): boolean {
  view.dispatch({
    ...view.state.replaceSelection("  "),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

export function createEditorExtensions(
  callbacks: EditorCallbacks,
  language: "mcfunction" | "json" = "mcfunction",
): Extension[] {
  const lintSource = (view: EditorView): CmDiagnostic[] => {
    const content = view.state.doc.toString();
    const { diagnostics, report } = callbacks.lint(content);
    callbacks.onLint?.(report);
    const length = view.state.doc.length;
    return diagnostics.map((d) => {
      const from = Math.max(0, Math.min(length, d.from));
      const to = Math.max(from + 1, Math.min(length, d.to || from + 1));
      return {
        from,
        to,
        severity: d.severity === "hint" ? "info" : d.severity,
        message: d.message,
        source: `cmdlib · ${d.code}`,
        actions: d.quickFix?.length
          ? d.quickFix.slice(0, 2).map((fix) => ({
              name: fix.title,
              apply: () => callbacks.onQuickFix?.(fix),
            }))
          : undefined,
      } as CmDiagnostic;
    });
  };

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    ...(language === "mcfunction"
      ? [
          autocompletion({
            override: [createCompletionSource(callbacks.getIndex)],
            activateOnTyping: true,
            maxRenderedOptions: 40,
            closeOnBlur: true,
            icons: true,
          }),
        ]
      : [autocompletion({ activateOnTyping: true })]),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    lintGutter(),
    language === "json" ? linter(jsonParseLinter(), { delay: 300 }) : linter(lintSource, { delay: 450 }),
    Prec.highest(
      keymap.of([
        {
          key: "Tab",
          preventDefault: true,
          run: (view) => {
            if (completionStatus(view.state) === "active") {
              acceptCompletion(view);
              return true;
            }
            return insertTwoSpaces(view);
          },
        },
      ]),
    ),
    keymap.of([
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...lintKeymap,
    ]),
    cmdlibEditorTheme,
    ...(language === "json" ? [json()] : mcfunctionSupport),
  ];
}
