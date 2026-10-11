import ReactDOM from "react-dom/client";
import { useEffect } from "react";
import { HashRouter } from "react-router";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { registerRainFlixServiceWorker } from "./lib/service-worker.js";
import { isNativeApp } from "./platform/index.js";
import "../styles/input.css";

function StartupReady() {
  useEffect(() => {
    window.dispatchEvent(new Event("rainflix:mounted"));
  }, []);
  return null;
}

ReactDOM.createRoot(document.querySelector("#root")).render(
  <AppErrorBoundary>
    <StartupReady />
    <HashRouter>
      <App />
    </HashRouter>
  </AppErrorBoundary>,
);

if (isNativeApp) {
  import("./platform/desktop.js")
    .then(({ initializeDesktopLinks }) => initializeDesktopLinks())
    .catch((error) => console.warn("Native app links could not start.", error));
}

if (!isNativeApp && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    registerRainFlixServiceWorker().catch((error) => {
      console.warn("RainFlix offline support could not start.", error);
    });
  });
}
