import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Pretendard variable font (Korean dynamic subset — 약 22KB로 빠른 첫 로딩).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
