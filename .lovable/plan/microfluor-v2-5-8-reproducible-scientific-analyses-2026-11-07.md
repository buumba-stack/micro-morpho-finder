# MicroFluor v2.5.8 — reproducible scientific analyses

## Scope and safeguards
- Preserve v2.5.7 segmentation, measurement, morphology classification and blank/contaminant matching algorithms unchanged.
- Add tools around the existing analysis pipeline, without overwriting existing saved batches or results.
- Preserve local-first analysis, reviewer access, Windows in-app owner sign-in, password reset and both AI security fixes.
- Do not build or distribute a Windows package in this task.

## 1. Recover settings
- Add a separate tool for raw images plus an earlier particle CSV.
- Sweep every integer threshold from **0–255** using the existing detector. Editable recovery defaults: **8 µm/px**, **400 µm²** minimum area, unlimited maximum area, circularity **0–1**, border exclusion on.
- Match images by filename, and verify the original-byte SHA-256 hash when supplied. Compare the complete candidate count and area/width/height measurement sets; do not treat accepted-only subsets as proof of an exact candidate match.
- For legacy CSVs rounded by MicroFluor, compare at their recorded export precision and explicitly label this limitation; do not claim original full-precision recovery from rounded values.
- Report all matching thresholds. Where none match, report closest threshold, candidate-count difference and measurement differences using a documented deterministic ranking.
- Export the requested recovery CSV with image/hash, matching thresholds, reference and matched counts, status, closest threshold and difference details.
- Require explicit selection when several thresholds match before saving recovered settings. Save new recovered records; never replace historical recorded settings.
- Include progress, cancellation and visible validation errors; run threshold sweeps off the main screen thread.

## 2. Permanent settings and per-image exports
- Store committed per-image settings, dimensions, original-file hash, tissue, batch association, run ID, timestamp, software version, library version, candidate/accepted/rejected counts and source (`recorded`/`recovered`) in new account-owned records.
- Retain immutable run-setting snapshots and candidate measurement references independently of the workspace; clearing or removing workspace images must not delete account records.
- Include zero-particle runs. Preserve multiple runs rather than overwriting history; export one image row for each selected batch's latest committed image run, with historical run records retained.
- Add **Settings per image** CSV for the selected batch and **all saved batches**, with every field listed in your brief. Use committed run settings rather than uncommitted edits.
- Keep local durable records and pending uploads for offline use. Show whether account saving succeeded or is pending. Anonymous reviewers remain local-only and receive the same local exports, without creating accounts.
- Historical cloud image references cannot supply missing settings: never invent or backfill them as recorded settings.

## 3. Versioned blank library and contamination memory
- Add **Export library** and **Import library** for a single ZIP containing artefact images/crops and a validated JSON manifest with IDs, features, family labels, confirmation status and dates.
- Retain original blank image bytes for newly imported images. Older library entries only have crops: export the available crops and explicitly identify missing originals.
- Include the relevant contamination-family definitions and observations so reproduction has the same matching context, without changing scoring or existing records.
- Give each content state a stable SHA-256 version ID using canonical content serialization and image hashes. Preserve the existing numeric mutation version for existing behavior.
- Save account-owned library versions and artefact files privately; retain historical versions required by recorded runs. Workspace clearing does not delete them.
- Import into an isolated preview/verification state and require confirmation before adding to the working library; never silently overwrite it.

## 4. Scientific exports
- Keep existing particle CSV columns and values unchanged. Append threshold, scale, original-image hash, library version, equivalent circular diameter, matched reference/family ID, similarity, agreeing-feature count, flag level and analyst decision timestamp.
- Append **full-precision area, width, height and Feret** fields for every candidate, including rejected candidates, so the particle CSV can serve as the reproduction companion file. Preserve the legacy rounded columns for compatibility.
- Compute equivalent circular diameter only as an export-derived value: `sqrt(4 × area / π)`.
- Export flag labels using **≥0.70 and ≥5 features**, and **≥0.85 and ≥7 features**, using existing match evidence. Keep lower-confidence contaminant suggestions unchanged and distinct from these labels.
- Leave unknown historical analyst timestamps blank; record timestamps for future decisions instead of inventing them.
- Add a separate segmentation-overlay PNG export with existing outlines and particle IDs for accepted, rejected and blank-matched particles; define distinct semantic colors and a concise legend. Do not replace the existing accepted-only scientific PNG export or rerun analysis for exports.
- Add a batch **Methods summary** TXT with version, scales, threshold range, filters, actual existing morphology criteria (including sphere rescue), blank-matching thresholds, library version(s) and image count.

## 5. Reproduce analysis
- Load raw images, **Settings per image CSV**, the exported library ZIP and a **separate companion particle CSV**.
- Match by both exact image name and original-byte SHA-256 hash; detect ambiguous names, missing files, duplicate rows and mismatched hashes explicitly.
- Verify the library content hash, restore the selected settings and matching context in an isolated reproduction run, then call the unchanged detector.
- Compare every candidate's **full-precision area, width, height and Feret diameter**, keyed by original candidate ID, plus total candidate counts. Report missing/extra candidates and expected, actual and difference values per particle.
- Use exact round-trip numeric equality for new full-precision exports. Older rounded/missing-hash files must be labeled insufficient for full-precision reproduction, not silently certified as exact.
- Manual acceptance/rejection is recorded review state, not something segmentation reconstructs. Deleted candidates require the stored original candidate reference to verify segmentation; report that distinction rather than modifying the original result.
- Export the verification report. Reproduction never replaces a committed analysis or alters the current library.

## 6. Small corrections and release documentation
- Correct the image-list scale label to **µm/px**, including any uppercase transformation causing the incorrect display.
- Before analysis, warn when recognized tissue words in a filename conflict with its assigned tissue; allow an explicit decision to proceed and do not change tissue automatically.
- Set the authoritative package version to **2.5.8** and update README and CHANGELOG. State that detection and measurement algorithms are unchanged from v2.5.7.

## Technical approach
- Add focused parsing, hashing, recovery, reproduction, library-archive and export modules. Use proven CSV/ZIP libraries and the existing `analyzeImageData` function; do not fork the detector.
- Add account-owned run/setting and versioned-library tables through additive migrations with explicit grants and user-scoped row protection; do not change existing batch rows. Use private storage for artefact images.
- Reuse the existing account session for cloud reads/writes and separate local persistence for offline/reviewer operation. Keep image settings independent of the single `session/current` record.
- Store unfiltered detector candidate references before manual deletion or rejection; retain committed review metadata separately. Serialize unlimited maximum area explicitly and round-trip it back to `Infinity`.
- All cloud saving is optional to the local analysis flow and reports errors visibly; no AI calls are involved in recovery, export or reproduction.

## Verification
- Capture v2.5.7 fixture outputs and verify unchanged detector/matcher files and identical results at the same settings, including ring particles, sphere rescue, edge exclusion and zero particles.
- Test every recovery threshold boundary, export/import precision, all candidate comparisons, hash/name mismatch, library version stability, ambiguity, flag thresholds and timestamp handling.
- Verify account isolation and persistence after workspace clearing, reload and offline-to-online synchronization.
- Exercise recovery → save → export settings/particles/library → reproduce end-to-end with real image fixtures and the owner session.
- Check the existing reviewer gate, password-reset page, AI protections, exports and local analysis still work. No Windows packaging.