import ReactDOM from "react-dom/client";
import { useEffect } from "react";
import { HashRouter } from "react-router";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { registerRainFlixServiceWorker } from "./lib/service-worker.js";
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

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    registerRainFlixServiceWorker().catch((error) => {
      console.warn("RainFlix offline support could not start.", error);
    });
  });
}
