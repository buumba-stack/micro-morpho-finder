# AI security fixes
- [x] Require verified account or reviewer access before AI Decide calls OpenAI.
- [x] Reject caller-supplied assistant roles in chat while retaining the displayed conversation.
- [x] Run focused regression tests and verify live endpoint protection.
- [x] Mark both existing security findings fixed.

# MicroFluor v2.5.8 reproducibility
- [x] Add threshold recovery and recovered account settings.
- [x] Persist per-image run settings and versioned libraries independently of workspace clearing.
- [x] Add per-image settings, detailed particle, segmentation overlay and methods exports.
- [x] Add reproduction verification using a companion particle CSV matched by image name and SHA-256 hash, comparing full-precision area, width, height and Feret per candidate.
- [x] Correct scale unit and warn about conflicting tissue assignments.
- [x] Update version/documentation and verify v2.5.7 algorithm parity.
- [x] Implement approved plan; leave Windows packaging deferred as requested.