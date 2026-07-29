import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import "../styles/input.css";

ReactDOM.createRoot(document.querySelector("#root")).render(
  <AppErrorBoundary>
    <HashRouter>
      <App />
    </HashRouter>
  </AppErrorBoundary>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const workerUrl = new URL(
      `${import.meta.env.BASE_URL}sw.js`,
      window.location.origin,
    );
    const buildId = new URL(import.meta.url).pathname.split("/").at(-1);
    workerUrl.searchParams.set("build", buildId || "app");

    navigator.serviceWorker
      .register(workerUrl, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error) => {
        console.warn("RainFlix offline support could not start.", error);
      });
  });
}
