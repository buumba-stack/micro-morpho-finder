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
  component: PrivacyPage;
}

function PrivacyPage() {
  return <LegalPage title="Privacy Policy" />;
}
