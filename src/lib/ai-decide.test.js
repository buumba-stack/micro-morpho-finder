import { beforeEach, expect, mock, test } from "bun:test";

let caller = null;
let allowanceDenied = null;
const completeJson = mock(async () => JSON.stringify({ decisions: [{ id: 1, verdict: "uncertain" }] }));
const logReviewerAiUse = mock(async () => {});
const checkReviewerAllowance = mock(async () => allowanceDenied);

mock.module("@tanstack/react-router", () => ({ createFileRoute: () => (options) => options }));
mock.module("@/lib/ai-quota.server", () => ({
  AI_CORS_HEADERS: { "Access-Control-Allow-Headers": "content-type, authorization" },
  authenticateAiRequest: async () => caller,
  clientUpdateRequired: () => Response.json({ error: "client_update_required" }, { status: 401 }),
  checkReviewerAllowance,
  logReviewerAiUse,
}));
mock.module("@/lib/openai-vision.server", () => ({
  completeJson,
  hasOpenAiKey: () => true,
  visionModel: () => "test-model",
  OpenAiError: class extends Error {},
}));

const { Route } = await import("../routes/api/public/ai-decide");
const payload = {
  file: "sample.png", tissue: "muscle", umPerPx: 1,
  candidates: [{ id: 1, area: 10, perimeter: 12, width: 3, height: 4,
    feret: 4, minFeret: 3, aspectRatio: 0.75, circularity: 0.8,
    morphology: "pellet", touchesBorder: false, pass: "general", thresholdUsed: 100 }],
};
const post = () => Route.server.handlers.POST({ request: new Request("http://localhost/api/public/ai-decide", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
}) });

beforeEach(() => {
  caller = null;
  allowanceDenied = null;
  completeJson.mockClear();
  logReviewerAiUse.mockClear();
  checkReviewerAllowance.mockClear();
});

test("unverified callers cannot reach paid AI", async () => {
  expect((await post()).status).toBe(401);
  expect(completeJson).not.toHaveBeenCalled();
});
test("verified owner uses existing decision logic without reviewer limits", async () => {
  caller = { kind: "user", userId: "owner-id", unlimited: true };
  const response = await post();
  expect(response.status).toBe(200);
  expect((await response.json()).decisions).toEqual([{ id: 1, verdict: "uncertain" }]);
  expect(completeJson).toHaveBeenCalledTimes(1);
  expect(checkReviewerAllowance).not.toHaveBeenCalled();
});
test("verified reviewer consumes shared reviewer allowance", async () => {
  caller = { kind: "reviewer", userId: "", unlimited: false };
  expect((await post()).status).toBe(200);
  expect(checkReviewerAllowance).toHaveBeenCalledTimes(1);
  expect(logReviewerAiUse).toHaveBeenCalledWith("ai-decide", true);
});
test("exhausted reviewer allowance blocks paid calls", async () => {
  caller = { kind: "reviewer", userId: "", unlimited: false };
  allowanceDenied = Response.json({ error: "reviewer_ai_quota_reached" }, { status: 429 });
  expect((await post()).status).toBe(429);
  expect(completeJson).not.toHaveBeenCalled();
});