# AI security fixes
- [x] Require verified account or reviewer access before AI Decide calls OpenAI.
- [x] Reject caller-supplied assistant roles in chat while retaining the displayed conversation.
- [x] Run focused regression tests and verify live endpoint protection.
- [x] Mark both existing security findings fixed.

# MicroFluor v2.5.8 reproducibility
- [ ] Add threshold recovery and recovered account settings.
- [ ] Persist per-image run settings and versioned libraries independently of workspace clearing.
- [ ] Add per-image settings, detailed particle, segmentation overlay and methods exports.
- [ ] Add reproduction verification with measurement references.
- [ ] Correct scale unit and warn about conflicting tissue assignments.
- [ ] Update version/documentation and verify v2.5.7 algorithm parity.
- [ ] Await plan approval before implementation; do not package Windows.