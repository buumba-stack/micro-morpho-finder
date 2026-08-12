import { Link } from "@tanstack/react-router";

/**
 * Ownership + legal footer shown on every web page. Presentation only.
 */
export function LegalFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-4 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p>MicroFluor © 2026 Buumba Hampuwo. All Rights Reserved.</p>
        <nav className="flex flex-wrap items-center gap-4">
          <Link to="/terms" className="transition-colors hover:text-foreground">
            Terms of Use
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/third-party-licenses" className="transition-colors hover:text-foreground">
            Third-Party Licenses
          </Link>
        </nav>
      </div>
    </footer>
  );
}
