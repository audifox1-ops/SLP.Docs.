# Bundle Chunking Research

Date: 2026-06-06

## Sources

- Vite 6 build options: https://v6.vite.dev/config/build-options
- Rollup `output.manualChunks`: https://rollupjs.org/configuration-options/#output-manualchunks
- Vite production build guide: https://vite.dev/guide/build

## Observed Pattern

- This project uses Vite 6.4.x, where `build.rollupOptions` is the documented way to customize the underlying Rollup bundle.
- Rollup supports `output.manualChunks` to place selected modules into named chunks.
- Vite compares chunk-size warnings against uncompressed JavaScript size, so the useful metric is the largest emitted JS chunk and whether the build still reports a chunk-size warning.

## Local Implication

The baseline production build succeeded but emitted a 2,080.90 kB main JS chunk and Vite's 500 kB chunk-size warning. A conservative candidate is to keep source imports unchanged and split large dependency families into stable vendor chunks in `vite.config.ts`.

Confidence: medium. This improves cacheability and reduces the main bundle size, but it does not remove code from the app. Runtime behavior still needs the existing lint/build gates.
