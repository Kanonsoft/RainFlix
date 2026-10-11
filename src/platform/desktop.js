import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { receiveAddonInstallLink } from "../lib/addon-install-links.js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isAndroid, isDesktop } from "./index.js";

export async function initializeDesktopLinks() {
  if (!isTauri()) return;
  if (isAndroid) {
    const { addPluginListener } = await import("@tauri-apps/api/core");
    await addPluginListener(
      "native-player",
      "rainflix:addon-install",
      ({ url }) => {
        if (url) receiveAddonInstallLink(url);
      },
    );
    const { url } = await invoke("plugin:native-player|take_install_link");
    if (url) receiveAddonInstallLink(url);
  }

  if (isDesktop) {
    await listen("rainflix:addon-link", async () => {
      const link = await invoke("take_addon_install_link");
      if (link) receiveAddonInstallLink(link);
    });
    const link = await invoke("take_addon_install_link");
    if (link) receiveAddonInstallLink(link);
  }

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
    if (["stremio:", "rainflix:"].includes(url.protocol)) {
      event.preventDefault();
      receiveAddonInstallLink(url.href);
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
