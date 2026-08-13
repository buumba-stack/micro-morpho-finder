import { createFileRoute } from "@tanstack/react-router";
// In web-prepublication builds this specifier is aliased to
// src/components/PrePublicationNotice.tsx (see vite.config.ts), so no analyzer
// code reaches the browser bundle. The desktop build imports the real module.
import { AnalyzerApp } from "@/components/AnalyzerApp";

declare const __MICROFLUOR_PREPUBLICATION__: boolean | undefined;
const PREPUB = typeof __MICROFLUOR_PREPUBLICATION__ === "boolean"
  ? __MICROFLUOR_PREPUBLICATION__
  : true;

const PREPUB_TITLE = "MicroFluor";
const PREPUB_DESC = "Pre-publication research software. Not currently available for public access.";
const FULL_TITLE = "MicroFluor · Microplastic Morphology Analyzer";
const FULL_DESC =
  "Batch count and classify microplastics in fluorescence photomicrographs of fish liver and intestine using an ImageJ-equivalent particle analysis workflow.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: PREPUB
      ? [
          { title: PREPUB_TITLE },
          { name: "description", content: PREPUB_DESC },
          { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
          { property: "og:title", content: PREPUB_TITLE },
          { property: "og:description", content: PREPUB_DESC },
          { property: "og:type", content: "website" },
        ]
      : [
          { title: FULL_TITLE },
          { name: "description", content: FULL_DESC },
          { property: "og:title", content: FULL_TITLE },
          { property: "og:description", content: FULL_DESC },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary_large_image" },
        ],
  }),
  component: AnalyzerApp,
});
