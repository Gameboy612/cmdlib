import type { Metadata } from "next";
import { ProjectsPage } from "@/components/projects/ProjectsPage";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Choose a cmdlib project, group multiple datapacks, or import a public GitHub repository to edit locally.",
};

export default function ProjectsRoute() {
  return <ProjectsPage />;
}
