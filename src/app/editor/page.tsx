import type { Metadata } from "next";
import { EditorShell } from "@/components/editor/EditorShell";

export const metadata: Metadata = {
  title: "Editor",
  description:
    "A dockable Minecraft datapack workbench: code editor, live world preview, command console, scoreboard and NBT inspectors, and 26.3-aware linting.",
};

export default function EditorPage() {
  return <EditorShell />;
}
