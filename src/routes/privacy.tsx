import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

const DESC =
  "How MicroFluor handles micrograph images, local browser storage, and optional AI review requests.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · MicroFluor" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Privacy Policy · MicroFluor" },
      { property: "og:description", content: DESC },
      { name: "twitter:title", content: "Privacy Policy · MicroFluor" },
      { name: "twitter:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy describes how MicroFluor handles data. It reflects what the software actually
        does today.
      </p>

      <h2>No accounts, no user database</h2>
      <p>
        MicroFluor has no sign-up, login, or user account system, and it does not maintain a user
        database. It does not ask for your name, email address, or other contact details.
      </p>

      <h2>Images and analysis results</h2>
      <p>
        Micrographs and procedural-blank images you add are decoded and analysed locally in the
        browser (or inside the desktop application). Images, particle measurements, per-image
        settings, and your procedural-blank library are stored on your own device using browser local
        storage mechanisms (IndexedDB / localStorage) so a session survives a reload. They are not
        uploaded to a MicroFluor server for storage, and they are never sold or shared for marketing.
        Clearing the session in the app, or clearing your browser/application data, removes them.
      </p>

      <h2>Optional AI review</h2>
      <p>
        AI features are optional and only run when you start them. When you request an AI QC review,
        an AI decision, or use the "ask the data" chat, the relevant image or particle crop and the
        associated measurement values are transmitted to the OpenAI API through a MicroFluor endpoint
        for processing, and the response is returned to you. That content is handled under OpenAI's
        own terms and privacy policy. If AI features are not used, no image data leaves your device.
      </p>

      <h2>Exports</h2>
      <p>
        CSV and report exports are generated in your browser and saved directly to your device. They
        are not transmitted to MicroFluor.
      </p>

      <h2>Analytics, advertising, and cookies</h2>
      <p>
        MicroFluor does not use advertising, does not sell data, and does not set cookies for
        tracking or profiling. Standard technical request logs may be produced by the hosting
        infrastructure that serves the website, and application errors may be logged for
        troubleshooting; these are used only to keep the service working.
      </p>

      <h2>Fonts and hosting</h2>
      <p>
        The web version loads web fonts from Google Fonts, which means your browser makes a request
        to Google's font servers when a page loads. The website is served by third-party hosting
        infrastructure.
      </p>

      <h2>Children</h2>
      <p>MicroFluor is a laboratory tool and is not directed at children.</p>

      <h2>Changes</h2>
      <p>
        If the software's data handling changes, this policy will be updated to match the actual
        behaviour.
      </p>

      <p className="pt-4">MicroFluor © 2026 Buumba Hampuwo. All Rights Reserved.</p>
    </LegalPage>
  );
}
