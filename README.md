# MicroFluor

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23983369.svg)](https://doi.org/10.5281/zenodo.23983369)

**Image-analysis and quality-control software for first-line, fluorescence-based screening of microplastic-like particles in biological samples.**

MicroFluor was developed as part of an integrated fluorescence workflow for screening low-micrometre microplastics in fish tissues (Hampuwo et al., in preparation; see [Citation](#citation)). It turns fluorescence micrographs into particle counts, sizes and shape classes, and checks every candidate particle against documented procedural-blank artefacts before it is accepted.

- **Web application:** https://fishmicroplasticfinder.com/
- **Windows desktop build:** see [Releases](../../releases)
- **Licence:** MIT

> MicroFluor is a screening tool. Fluorescent stains are not polymer-specific, so accepted detections are reported as *microplastic-like particles*. Use polymer-specific methods (e.g. µFTIR, Raman, Py-GC/MS) where chemical confirmation is required.

---

## What it does

1. **Calibration.** Converts pixels to micrometres using a stage-micrometre calibration.
2. **Segmentation.** Each image is thresholded individually and connected fluorescent objects are segmented.
3. **Morphometrics.** For every object: area, perimeter, width, height, Feret diameters, aspect ratio (AR = width/height) and circularity.
4. **Shape classification.**

   | Class | Criterion |
   |---|---|
   | Fibre | AR ≤ 0.33 or AR ≥ 3 |
   | Sphere | circularity > 0.90, **or** circularity > 0.60 with AR 0.85–1.18 and min/max Feret ratio ≥ 0.85 |
   | Pellet | circularity > 0.60, not meeting sphere criteria |
   | Fragment | circularity ≤ 0.60 |

   Criteria adapted from Liu et al. (2022) and Pagliaccia et al. (2025), with the sphere criterion modified for fluorescence microscopy.

5. **Blank and contamination screening (QA/QC).** Each candidate is compared with every artefact in the loaded procedural-blank library and the recurrent-contaminant memory:
   - **Flagged match:** similarity ≥ 0.70 with agreement in ≥ 5 features
   - **High-confidence match:** similarity ≥ 0.85 with agreement in ≥ 7 features

   Flagged candidates are shown for analyst review. **The analyst makes the final accept/reject decision.**

6. **Export.** Accepted particles with morphometrics and class labels, for abundance (particles g⁻¹), size-distribution and shape analyses.

## Using MicroFluor

### Reproducibility tools (v2.5.8)
- **Recover settings:** load raw images and an earlier particle CSV, then sweep thresholds 0–255 with editable scale and filters. Defaults are 8 µm/px, minimum area 400 µm², unlimited maximum area, circularity 0–1, and edge exclusion. Legacy rounded CSVs are compared only at their export precision, not certified as full-precision recovery.
- **Permanent settings:** newly committed image runs retain raw-file SHA-256, dimensions, applied settings, candidate measurements, counts and provenance independently of workspace clearing. Signed-in account saves use private records; reviewers remain local-only. Save/upload status is visible.
- **Settings per image:** export the current batch or all saved batches, including zero-particle runs. Earlier cloud records without image settings cannot be reconstructed automatically.
- **Versioned library ZIP:** export artefact crops, available original blank images, metadata and contamination-family evidence with a content SHA-256. Older records without original images are identified in the manifest. Validate an imported ZIP before adding it to the working library, or load it privately from your account.
- **Reproduce analysis:** load raw images, settings CSV, library ZIP and companion particle CSV. Match filename and SHA-256, compare full-precision area, width, height and Feret for every candidate, and export per-particle differences. The new particle CSV retains rounded legacy columns and appends full-precision fields and original candidate references so manual deletions do not erase segmentation evidence.
- **Scientific exports:** particle CSV adds settings, image/library hashes, equivalent circular diameter, match evidence and decision times. Segmentation overlays include accepted, rejected and blank-matched particles; the existing accepted-only PNG export remains available. Methods summaries list settings, criteria and library versions.

Recovery and reproduction use the existing detector without AI. Segmentation, measurement, morphology and matching algorithms are unchanged from v2.5.7. Raw sample images stay local; account library saving uploads only library artefacts in private ZIPs. No v2.5.8 Windows package has been built.

### Web application
Open https://fishmicroplasticfinder.com/ in a modern browser (Chrome, Edge, Firefox or Safari).

### Windows desktop app
1. Download `MicroFluor-Windows-x64-v2.5.7.zip` from [Releases](../../releases).
2. Unzip and run `MicroFluor.exe`. (Windows may show a SmartScreen warning because the app is not code-signed; choose *More info → Run anyway*.)

Requirements: Windows 10 or later, 64-bit.

### Running from source
Requirements: [Node.js](https://nodejs.org/) 20 or later and npm.

```bash
git clone https://github.com/buumba-stack/micro-morpho-finder.git
cd micro-morpho-finder
npm install
npm run dev        # starts the local development server
```

Build for production with `npm run build`. Account features use a hosted backend; to use your own Supabase project, replace the `SUPABASE_*` and `VITE_SUPABASE_*` values in `.env`.

## Built with
TypeScript, React, TanStack Start/Router, Tailwind CSS, Radix UI, Recharts and Zod; desktop packaging with Electron. Developed with [Lovable](https://lovable.dev).

## Citation
If you use MicroFluor, please cite the software (see `CITATION.cff`, or use GitHub's *Cite this repository* button) and the associated article:

> Hampuwo, B., Lahnsteiner, E., Dünser, A., Friedrich, T., Lahnsteiner, F. An integrated fluorescence-based workflow for first-line screening of low-micrometre microplastics in fish tissues. *In preparation.*

Archived version: v2.5.7, https://doi.org/10.5281/zenodo.23983369 (all versions: https://doi.org/10.5281/zenodo.23977086).

## Licence
MicroFluor is released under the [MIT License](LICENSE). Third-party components remain under their own licences; see `THIRD-PARTY-NOTICES.txt`.

## Contact
Buumba Hampuwo, BOKU University, Institute of Hydrobiology and Aquatic Ecosystem Management, Vienna, Austria – buumba.hampuwo@boku.ac.at
