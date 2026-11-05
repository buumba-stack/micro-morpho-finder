# Fish Microplastic Finder

have 400 florencnece photomicrographs, of microplastics pictures from liver anmd instetine of wild fish, the microplastics are of different sizes and shapes. I want use AI agentic or automatic process to count the microplastcs from the pictures, define a mophology using a defiend criteria Particle morphology was determined from fluorescence micrographs using ImageJ version 1.54f (National Institutes of Health, USA). The image scale was calibrated using Analyze > Set Scale. Images were converted to 8-bit grayscale, and a threshold was applied to separate fluorescent particles from the background. The thresholded images were converted to binary images, and individual particles were measured using Analyze > Analyze Particles. Under Analyze > Set Measurements, Area, Perimeter, Shape Descriptors, Feret's Diameter, and Bounding Rectangle were selected. For each accepted particle, ImageJ recorded area, perimeter, width, height, Feret's diameter, aspect ratio, and circularity. Circularity was calculated by ImageJ as: Circularity = 4 × π × Area / Perimeter². A value of 1 represents a perfect circle, whereas lower values indicate increasingly irregular or elongated shapes. Aspect ratio was calculated as: Aspect ratio = Width / Height. Particles were classified as fibres when the aspect ratio was ≤ 0.33 or ≥ 3; as spheres when the aspect ratio was > 0.33 and < 3 and circularity was > 0.90; as pellets when the aspect ratio was > 0.33 and < 3 and circularity was > 0.60 and ≤ 0.90; and as fragments when the aspect ratio was > 0.33 and < 3 and circularity was ≤ 0.60. Each automated classification was visually checked against the original fluorescence image. Overlapping particles, particles touching the image border, objects with incomplete outlines, and objects with fluorescence inconsistent with the positive controls were excluded.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://micro-morpho-finder.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7c28e508-642b-4ca7-9872-79dbf40d3aff).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
