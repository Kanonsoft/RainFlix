import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").pop();
const githubPagesBase =
  repositoryName && !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}/`
    : "/";

export default defineConfig(({ command, isPreview, mode }) => ({
  // CI smoke tests use the development server at /, not the deployment subfolder.
  base:
    mode !== "desktop" &&
    mode !== "mobile" &&
    (command === "build" || isPreview) &&
    process.env.GITHUB_ACTIONS === "true"
      ? githubPagesBase
      : "/",
  build:
    mode === "mobile"
      ? { outDir: "dist-mobile" }
      : mode === "desktop"
        ? { outDir: "dist-desktop" }
        : undefined,
  server: {
    watch: {
      ignored: [
        "**/src-tauri/target/**",
        "**/src-tauri/gen/**",
        "**/src-tauri/plugins/**/android/.tauri/**",
        "**/src-tauri/plugins/**/android/build/**",
        "**/dist-desktop/**",
        "**/dist-mobile/**",
      ],
    },
  },
  plugins: [react()],
}));
