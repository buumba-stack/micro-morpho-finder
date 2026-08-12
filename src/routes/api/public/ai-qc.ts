import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GatewayError, collectText, openResponsesStream, GPT5_MODEL } from "@/lib/gpt5.server";
import {
  AI_CORS_HEADERS as CORS_HEADERS,
  authenticateAiRequest,
  clientUpdateRequired,
  commitReviewSuccess,
  logReviewAttempt,
  quotaExhausted,
  releaseReviewCredit,
  reserveReviewCredit,
} from "@/lib/ai-quota.server";


const ParticleSchema = z.object({
  id: z.number(),
  area: z.number(),
  perimeter: z.number(),
  width: z.number(),
  height: z.number(),
  feret: z.number(),
  minFeret: z.number(),
  aspectRatio: z.number(),
  circularity: z.number(),
  morphology: z.string(),
  touchesBorder: z.boolean(),
  crop: z.string().optional(),
  blankSimilarity: z.number().optional(),
  blankReference: z.string().optional(),
  blankCrop: z.string().optional(),
});

const BodySchema = z.object({
  file: z.string(),
  tissue: z.string(),
  umPerPx: z.number(),
  threshold: z.number(),
  particles: z.array(ParticleSchema).min(1).max(30),
});

const INSTRUCTIONS = `You are a microplastics image-analysis QC assistant reviewing particles
detected in fluorescence photomicrographs of wild fish liver and intestine.

For each particle you get its ImageJ-equivalent measurements and, when available, a cropped
fluorescence image of the particle with its detected outline drawn on it.

Classification criteria (must be applied exactly):
- fibre: aspect ratio <= 0.33 or >= 3
- sphere: 0.33 < AR < 3 and circularity > 0.90
- pellet: 0.33 < AR < 3 and 0.60 < circularity <= 0.90
- fragment: 0.33 < AR < 3 and circularity <= 0.60

Exclusion rules — flag a particle for exclusion when the crop shows:
- overlapping / touching particles measured as one object
- an incomplete or broken outline (object clipped or partially thresholded)
- the object touches the image border
- fluorescence inconsistent with a plastic positive control (dim, diffuse, tissue autofluorescence,
  debris, or non-particulate haze)

Some particles include a comparison with a CONFIRMED procedural-blank artefact (similarity score and
a crop of that artefact). A close visual and morphological match is evidence for exclusion as a blank
artefact; a weak or ambiguous match is NOT. Never exclude on the score alone — if the sample crop and
the blank crop do not clearly look like the same kind of object, answer "uncertain".

Return "keep" only when the measurement-based morphology is consistent with what the crop shows and
no exclusion rule applies. Use "uncertain" when the crop is not clear enough to decide. Keep notes
under 140 characters and reference what you actually see.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict", "morphology", "issue", "confidence", "note"],
        properties: {
          id: { type: "integer" },
          verdict: { type: "string", enum: ["keep", "exclude", "uncertain"] },
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
              "too_faint",
              "not_a_particle",
            ],
          },
          confidence: { type: "number" },
          note: { type: "string" },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export const Route = createFileRoute("/api/public/ai-qc")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        // 1. Authentication — old clients send no bearer token.
        const caller = await authenticateAiRequest(request);
        if (!caller) return clientUpdateRequired();

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Invalid request", {
            status: 400,
            headers: CORS_HEADERS,
          });
        }

        // 2. Reserve the entitlement BEFORE any gateway traffic.
        let remaining: number | null = null;
        if (!caller.unlimited) {
          try {
            remaining = await reserveReviewCredit(caller.userId);
          } catch (err) {
            return new Response(err instanceof Error ? err.message : "Quota check failed", {
              status: 503,
              headers: CORS_HEADERS,
            });
          }
          if (remaining === null) {
            await logReviewAttempt({
              userId: caller.userId,
              success: false,
              charged: false,
              ownerExempt: false,
              remainingAfter: 0,
              clientVersion: caller.clientVersion,
              model: GPT5_MODEL,
              errorCode: "ai_review_quota_exhausted",
            });
            return quotaExhausted();
          }
        }


        const content: unknown[] = [
          {
            type: "input_text",
            text: [
              `Image: ${body.file} (tissue: ${body.tissue})`,
              `Scale: ${body.umPerPx} µm/px · fixed 8-bit threshold: ${body.threshold}`,
              "",
              "Particles (measurements in µm / µm²):",
              ...body.particles.map(
                (p) =>
                  `#${p.id} area=${p.area.toFixed(2)} perim=${p.perimeter.toFixed(2)} w=${p.width.toFixed(2)} h=${p.height.toFixed(2)} feret=${p.feret.toFixed(2)} minFeret=${p.minFeret.toFixed(2)} AR=${p.aspectRatio.toFixed(3)} circ=${p.circularity.toFixed(3)} auto=${p.morphology} border=${p.touchesBorder}${p.blankSimilarity !== undefined ? ` blankMatch=${p.blankSimilarity.toFixed(2)}${p.blankReference ? `/${p.blankReference}` : ""}` : ""}`,
              ),
              "",
              "Review every particle listed above and return one entry per id.",
            ].join("\n"),
          },
        ];

        for (const p of body.particles) {
          if (!p.crop) continue;
          content.push({ type: "input_text", text: `Crop of particle #${p.id}:` });
          content.push({ type: "input_image", image_url: p.crop, detail: "auto" });
          if (p.blankCrop) {
            content.push({
              type: "input_text",
              text: `Confirmed procedural-blank artefact matched to particle #${p.id} (similarity ${(p.blankSimilarity ?? 0).toFixed(2)}):`,
            });
            content.push({ type: "input_image", image_url: p.blankCrop, detail: "auto" });
          }
        }

        try {
          const stream = await openResponsesStream({
            instructions: INSTRUCTIONS,
            input: [{ role: "user", content }],
            jsonSchema: { name: "particle_reviews", schema: SCHEMA },
            reasoningEffort: "low",
          });
          const text = await collectText(stream);
          const parsed = text ? (JSON.parse(text) as unknown) : { reviews: [] };
          return Response.json(parsed, { headers: CORS_HEADERS });
        } catch (err) {
          const status = err instanceof GatewayError ? err.status : 500;
          console.error("ai-qc failed", err);
          return new Response(err instanceof Error ? err.message : "AI review failed", {
            status,
            headers: CORS_HEADERS,
          });
        }
      },
    },
  },
});
