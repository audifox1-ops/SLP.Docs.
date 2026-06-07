import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const vendorChunkGroups: [string, string[]][] = [
  ['react-vendor', ['react', 'react-dom', 'scheduler']],
  ['firebase-firestore-vendor', ['firebase/firestore', '@firebase/firestore', '@firebase/webchannel-wrapper']],
  ['firebase-storage-vendor', ['firebase/storage', '@firebase/storage']],
  ['firebase-auth-vendor', ['firebase/auth', '@firebase/auth']],
  ['firebase-core-vendor', [
    'firebase/app',
    'firebase/app-check',
    '@firebase/app',
    '@firebase/app-check',
    '@firebase/component',
    '@firebase/installations',
    '@firebase/logger',
    '@firebase/util',
  ]],
  ['firebase-vendor', ['firebase', '@firebase']],
  ['docx-vendor', ['docx']],
  ['template-vendor', ['docxtemplater', 'pizzip', 'file-saver']],
  ['hwpx-vendor', ['@ssabrojs/hwpxjs', '@xmldom/xmldom']],
  ['pdf-vendor', ['pdfjs-dist']],
  ['spreadsheet-vendor', ['xlsx', 'papaparse']],
  ['ui-vendor', ['lucide-react', 'motion']],
  ['ai-vendor', ['@google/genai']],
];

const matchesPackage = (id: string, packageName: string) => {
  const normalized = id.split(path.sep).join('/');
  return (
    normalized.includes(`/node_modules/${packageName}/`) ||
    normalized.endsWith(`/node_modules/${packageName}`)
  );
};

const getVendorChunk = (id: string) => {
  if (!id.includes('node_modules')) return undefined;

  for (const [chunkName, packages] of vendorChunkGroups) {
    if (packages.some(packageName => matchesPackage(id, packageName))) {
      return chunkName;
    }
  }

  return 'vendor';
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: getVendorChunk,
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://picsum.photos https:; connect-src 'self' wss: https:;",
      },
    },
  };
});
