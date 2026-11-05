import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

const DESC =
  "Third-party and open-source components distributed with MicroFluor, and where to find their license terms.";

export const Route = createFileRoute("/third-party-licenses")({
  head: () => ({
    meta: [
      { title: "Third-Party Licenses · MicroFluor" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Third-Party Licenses · MicroFluor" },
      { property: "og:description", content: DESC },
      { name: "twitter:title", content: "Third-Party Licenses · MicroFluor" },
      { name: "twitter:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThirdPartyPage,
});

function ThirdPartyPage() {
  return (
    <LegalPage title="Third-Party Licenses">
      <p>
        MicroFluor uses third-party libraries and open-source components. Those components are{" "}
        <strong>not</strong> owned by Buumba Hampuwo. They remain the property of their respective
        copyright holders and are governed by their own license terms, which continue to apply in
        full.
      </p>

      <h2>Components include, among others</h2>
      <ul>
        <li>Electron</li>
        <li>Chromium</li>
        <li>React and React DOM</li>
        <li>TanStack (Router, Start, Query)</li>
        <li>Radix UI</li>
        <li>Tailwind CSS</li>
        <li>Recharts</li>
        <li>Zod</li>
        <li>other JavaScript, web, and native dependencies</li>
      </ul>

      <h2>Where to find the notices</h2>
      <p>
        The Windows desktop distribution ships a <code>THIRD-PARTY-LICENSES</code> folder next to{" "}
        <code>MicroFluor.exe</code> containing:
      </p>
      <ul>
        <li>
          <code>ELECTRON-LICENSE.txt</code> — the Electron/GitHub license notice, unmodified
        </li>
        <li>
          <code>LICENSES.chromium.html</code> — the Chromium license notices, unmodified
        </li>
        <li>
          <code>THIRD-PARTY-NOTICES.txt</code> — a summary notice for third-party components
        </li>
      </ul>
      <p>
        Per-package license texts are also included within each dependency's own distribution in the
        project's dependency tree.
      </p>

      <h2>Relationship to MicroFluor's own license</h2>
      <p>
        MicroFluor's original components are released under the MIT License. Third-party components
        remain under their own licenses, and nothing in MicroFluor's license restricts any right
        granted to you by an applicable third-party open-source license.
      </p>

      <p className="pt-4">MicroFluor © 2026 Buumba Hampuwo. Released under the MIT License.</p>
    </LegalPage>
  );
}
