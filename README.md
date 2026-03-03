## Box-Counting Fractal Dimension Visualizer

This is a minimal single-file React application (bundled with Vite) that visualizes the **box-counting method** for estimating the fractal dimension of an image.

- **Frontend stack**: React 18, TypeScript, Tailwind CSS, Lucide-React, Recharts, Vite.
- **Core idea**: Convert an uploaded image to a binary mask (via grayscale + threshold), overlay grids of different box sizes, count non-empty boxes per scale, and fit a line to \`log(N(s))\` vs \`log(1/s)\` to estimate the fractal dimension.

### Getting started

```bash
pnpm install   # or npm install / yarn
pnpm dev       # or npm run dev / yarn dev
```

Then open the printed localhost URL in your browser.

### Usage

1. Upload any image.
2. Adjust the **Threshold** slider to control which pixels are treated as foreground (black).
3. Toggle **Run Simulation** to start/stop the box-counting animation.
4. Watch:
   - The left canvas with the **dynamic grid overlay** and highlighted non-empty boxes.
   - The right side **log–log plot** with a live-updating **best-fit line** and the current estimate of the fractal dimension \(D\).

# box_counting_app
