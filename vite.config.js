import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").pop();
const githubPagesBase =
  repositoryName && !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}/`
    : "/";

export default defineConfig(({ command, isPreview }) => ({
  // CI smoke tests use the development server at /, not the deployment subfolder.
  base:
    (command === "build" || isPreview) && process.env.GITHUB_ACTIONS === "true"
      ? githubPagesBase
      : "/",
  plugins: [react()],
}));
