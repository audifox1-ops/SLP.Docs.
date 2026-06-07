# Firebase Chunk Split

## Sources

- Vite 6 build options: https://v6.vite.dev/config/build-options
- Rollup `output.manualChunks`: https://rollupjs.org/configuration-options/#output-manualchunks
- Vite GitHub discussion on manual vendor chunking: https://github.com/vitejs/vite/discussions/17566

## Baseline

Current production build passed, but the emitted `firebase-vendor` chunk was above Vite's default warning threshold.

- Largest emitted JS chunk: `firebase-vendor`, 515.46 kB.
- Vite chunk-size warnings: 1.
- Existing config grouped all `firebase` and `@firebase` packages into one manual chunk.

## Candidate

Keep app imports and source behavior unchanged. Split the Firebase manual chunk by SDK surface:

- `firebase-firestore-vendor`
- `firebase-storage-vendor`
- `firebase-auth-vendor`
- `firebase-core-vendor`
- fallback `firebase-vendor`

## A/B Result

- Largest emitted JS chunk: 515.46 kB -> 452.16 kB.
- Vite chunk-size warnings: 1 -> 0.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

Decision: adopt. This improves build chunking without changing Firestore, Storage, Auth, App Check, document generation, or UI behavior.
