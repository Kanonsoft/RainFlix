import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import App from "./App.jsx";
import "../styles/input.css";

ReactDOM.createRoot(document.querySelector("#root")).render(
  <HashRouter>
    <App />
  </HashRouter>,
);
