import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { completeJson, hasOpenAiKey, OpenAiError, visionModel } from "@/lib/openai-vision.server";
import {
  AI_CORS_HEADERS as CORS,
  authenticateAiRequest,
  checkReviewerAllowance,
  clientUpdateRequired,
  logReviewerAiUse,
} from "@/lib/ai-quota.server";


const BlankRefSchema = z.object({
  refId: z.string().max(120),
  annotation: z.string().max(60),
  similarity: z.number(),
  provenanceTier: z.string().max(60),
  crop: z.string().max(2_000_000).optional(),
  summary: z.string().max(600).optional(),
});

const CandidateSchema = z.object({
  id: z.number(),
  area: z.number(),
  perimeter: z.number(),
  width: z.number(),
  height: z.number(),
  feret: z.number(),
  minFeret: z.number(),
  aspectRatio: z.number(),
  circularity: z.number(),
  morphology: z.string().max(30),
  touchesBorder: z.boolean(),
  pass: z.enum(["fibre", "general"]),
  thresholdUsed: z.number(),
  minFeretPx: z.number().optional(),
  belowMinResolvable: z.boolean().optional(),
  crop: z.string().max(2_000_000).optional(),
  contextCrop: z.string().max(2_000_000).optional(),
  blankMatches: z.array(BlankRefSchema).max(4).default([]),
});

const BodySchema = z.object({
  file: z.string().max(300),
  tissue: z.string().max(60),
  umPerPx: z.number(),
  minResolvableUm: z.number().optional(),
  blankLibraryVersion: z.number().optional(),
  candidates: z.array(CandidateSchema).min(1).max(8),
});

const INSTRUCTIONS = `You are the image-reasoning reviewer of an auditable microplastics analysis
system working on fluorescence photomicrographs of wild fish tissue (liver, intestine, muscle).

A deterministic ImageJ-equivalent detector already measured each candidate object. You never
re-measure; you judge what the crops show.

Morphology criteria (apply exactly, from the given measurements):
- fibre: aspect ratio <= 0.33 or >= 3
- sphere: 0.33 < AR < 3 and circularity > 0.90
- pellet: 0.33 < AR < 3 and 0.60 < circularity <= 0.90
- fragment: 0.33 < AR < 3 and circularity <= 0.60

Decision rules — these are safety-critical:
1. Only return "exclude_blank_match" when a supplied procedural-blank reference is annotated as a
   confirmed procedural artefact AND the candidate visually matches it (shape, texture, edge
   character, fluorescence colour and intensity). Colour alone is never sufficient. Name the
   matched reference in matchedBlankRefId.
2. Return "exclude_quality" for overlapping objects measured as one, incomplete/clipped outlines,
   border contact, or fluorescence inconsistent with a plastic positive control.
3. Return "uncertain" whenever you cannot decide from the evidence given. Never guess an exclusion.
   Uncertain objects stay in the dataset and are surfaced for human review.
4. Return "include" only when the object looks like a genuine plastic particle, the outline is
   complete, and no blank artefact matches it.
5. If the object is below the minimum resolvable size, say so in reasoning and prefer "uncertain"
   over "include".

Keep reasoning under 220 characters and describe what you actually see in the crop.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "verdict",
          "morphology",
          "issue",
          "confidence",
          "matchedBlankRefId",
          "blankMatchConfidence",
          "reasoning",
        ],
        properties: {
          id: { type: "integer" },
          verdict: {
            type: "string",
            enum: ["include", "exclude_blank_match", "exclude_quality", "uncertain"],
          },
          morphology: {
            type: "string",
            enum: ["fibre", "sphere", "pellet", "fragment", "unclear"],
          },
          issue: {
            type: "string",
            enum: [
              "none",
              "overlapping",
              "incomplete_outline",
              "touching_border",
              "fluorescence_mismatch",
              "below_min_resolvable",
              "blank_artifact",
              "not_a_particle",
            ],
          },
          confidence: { type: "number" },
          matchedBlankRefId: { type: ["string", "null"] },
          blankMatchConfidence: { type: ["number", "null"] },
          reasoning: { type: "string" },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export const Route = createFileRoute("/api/public/ai-decide")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () =>
        Response.json(
          { available: hasOpenAiKey(), model: hasOpenAiKey() ? visionModel() : null },
          { headers: CORS },
        ),
      POST: async ({ request }) => {
        const caller = await authenticateAiRequest(request);
        if (!caller) return clientUpdateRequired();

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Invalid request", {
            status: 400,
            headers: CORS,
          });
        }

        if (!hasOpenAiKey()) {
          return Response.json(
            { decisions: [], degraded: true, reason: "OPENAI_API_KEY not configured" },
            { status: 503, headers: CORS },
          );
        }

        if (caller.kind === "reviewer") {
          const denied = await checkReviewerAllowance();
          if (denied) return denied;
        }

        const content: unknown[] = [
          {
            type: "input_text",
            text: [
              `Image: ${body.file} (tissue: ${body.tissue})`,
              `Scale: ${body.umPerPx} µm/px${
                body.minResolvableUm ? ` · minimum resolvable size: ${body.minResolvableUm} µm` : ""
              }`,
              body.blankLibraryVersion !== undefined
                ? `Blank library version: ${body.blankLibraryVersion}`
                : "",
              "",
              "Candidates (µm / µm²):",
              ...body.candidates.map((c) =>
                [
                  `#${c.id} pass=${c.pass} threshold=${c.thresholdUsed}`,
                  `area=${c.area.toFixed(2)} perim=${c.perimeter.toFixed(2)} w=${c.width.toFixed(2)} h=${c.height.toFixed(2)}`,
                  `feret=${c.feret.toFixed(2)} minFeret=${c.minFeret.toFixed(2)} AR=${c.aspectRatio.toFixed(3)} circ=${c.circularity.toFixed(3)}`,
                  `auto=${c.morphology} border=${c.touchesBorder} belowMinResolvable=${c.belowMinResolvable ?? false}`,
                  c.blankMatches.length
                    ? `blank candidates: ${c.blankMatches
                        .map(
                          (b) =>
                            `${b.refId} (${b.annotation}, similarity ${b.similarity.toFixed(2)}, provenance ${b.provenanceTier}${b.summary ? `, ${b.summary}` : ""})`,
                        )
                        .join("; ")}`
                    : "blank candidates: none retrieved",
                ].join(" | "),
              ),
              "",
              "Return exactly one decision per candidate id.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ];

        for (const c of body.candidates) {
          if (c.crop) {
            content.push({ type: "input_text", text: `Candidate #${c.id} — native crop:` });
            content.push({ type: "input_image", image_url: c.crop, detail: "auto" });
          }
          if (c.contextCrop) {
            content.push({ type: "input_text", text: `Candidate #${c.id} — context crop:` });
            content.push({ type: "input_image", image_url: c.contextCrop, detail: "auto" });
          }
          for (const b of c.blankMatches) {
            if (!b.crop) continue;
            content.push({
              type: "input_text",
              text: `Blank reference ${b.refId} (${b.annotation}) offered for candidate #${c.id}:`,
            });
            content.push({ type: "input_image", image_url: b.crop, detail: "auto" });
          }
        }

        try {
          const text = await completeJson({
            instructions: INSTRUCTIONS,
            input: [{ role: "user", content }],
            jsonSchema: { name: "particle_decisions", schema: SCHEMA },
            reasoningEffort: "low",
          });
          const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : { decisions: [] };
          if (caller.kind === "reviewer") await logReviewerAiUse("ai-decide", true);
          return Response.json(
            {
              ...parsed,
              audit: {
                model: visionModel(),
                decidedAt: new Date().toISOString(),
                blankLibraryVersion: body.blankLibraryVersion ?? null,
                umPerPx: body.umPerPx,
              },
            },
            { headers: CORS },
          );
        } catch (err) {
          if (caller.kind === "reviewer") await logReviewerAiUse("ai-decide", false);
          const status = err instanceof OpenAiError ? err.status : 500;
          console.error("ai-decide failed", err);
          return Response.json(
            {
              decisions: [],
              degraded: true,
              reason: err instanceof Error ? err.message : "AI decision failed",
            },
            { status, headers: CORS },
          );
        }
      },
    },
  },
});
