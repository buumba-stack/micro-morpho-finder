import { createRoot } from "react-dom/client";
import "../src/styles.css";
import { AnalyzerApp } from "../src/components/AnalyzerApp";

createRoot(document.getElementById("root")!).render(<AnalyzerApp />);
