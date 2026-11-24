import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Light/dark display toggle. Light is the default; choice kept in this browser. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(localStorage.getItem("microfluor.theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const toggle = () => {
    const next = !dark;
    localStorage.setItem("microfluor.theme", next ? "dark" : "light");
    setDark(next);
  };
  return (
    <button type="button" onClick={toggle} className="btn-ghost min-h-9" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
