export type EditorCommand = "undo" | "redo" | "find" | "selectAll" | "copy" | "cut";

export function dispatchEditorCommand(command: EditorCommand): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<EditorCommand>("cmdlib:editor-command", { detail: command }),
  );
}
