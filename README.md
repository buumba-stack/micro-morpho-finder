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
