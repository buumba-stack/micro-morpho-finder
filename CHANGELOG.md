# Changelog

## 2.5.8 — 2026-11-07
- Added threshold recovery, permanent per-image run settings, per-image/all-batch settings CSVs, private versioned library ZIPs and companion-particle reproduction comparisons.
- Added full-precision particle measurements, image/library hashes, equivalent circular diameter, matching evidence and future analyst decision timestamps while retaining existing CSV columns.
- Added segmentation overlays and methods summaries. Corrected the µm/px label and added filename/tissue conflict warnings.
- Detection and measurement algorithms are unchanged from v2.5.7; segmentation, morphology classification and blank/contaminant scoring were not modified.
- Existing saved batches and results are not migrated or overwritten; historical missing settings/timestamps are not fabricated.
- Windows packaging is deferred until explicitly requested.