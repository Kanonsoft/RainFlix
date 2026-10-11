import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { receiveAddonInstallLink } from "../lib/addon-install-links.js";
import { openUrl } from "@tauri-apps/plugin-opener";

export async function initializeDesktopLinks() {
  if (!isTauri()) return;

  await listen("rainflix:addon-link", async () => {
    const link = await invoke("take_addon_install_link");
    if (link) receiveAddonInstallLink(link);
  });
  const link = await invoke("take_addon_install_link");
  if (link) receiveAddonInstallLink(link);

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor) return;

    let url;
    try {
      url = new URL(anchor.href);
    } catch {
      return;
    }
    if (
      !["http:", "https:", "mailto:", "magnet:"].includes(url.protocol) ||
      ((url.protocol === "http:" || url.protocol === "https:") &&
        url.origin === window.location.origin)
    ) {
      return;
    }

    event.preventDefault();
    openUrl(url.href).catch((error) => {
      console.warn("Could not open the external destination.", error);
    });
  });
}
