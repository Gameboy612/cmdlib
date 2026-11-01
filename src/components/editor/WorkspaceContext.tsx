"use client";

import { createContext, useContext } from "react";
import type { DockviewApi } from "dockview";

export interface WorkspaceContextValue {
  api: DockviewApi | null;
  openPanel: (id: string) => void;
  resetLayout: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  api: null,
  openPanel: () => {},
  resetLayout: () => {},
});

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
