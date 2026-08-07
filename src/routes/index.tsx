import { createFileRoute } from "@tanstack/react-router";
import { AnalyzerApp } from "@/components/AnalyzerApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MicroFluor · Microplastic Morphology Analyzer" },
      {
        name: "description",
        content:
          "Batch count and classify microplastics in fluorescence photomicrographs of fish liver and intestine using an ImageJ-equivalent particle analysis workflow.",
      },
      { property: "og:title", content: "MicroFluor · Microplastic Morphology Analyzer" },
      {
        property: "og:description",
        content:
          "Batch count and classify microplastics in fluorescence photomicrographs of fish liver and intestine using an ImageJ-equivalent particle analysis workflow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyzerApp,
});

