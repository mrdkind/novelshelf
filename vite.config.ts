/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Base Path سایت.
 * - در توسعه محلی: "/"
 * - در GitHub Actions: هنگام Build با سوییچ --base=/REPO_NAME/ بازنویسی می‌شود.
 *   (مطابق README، لازم نیست این مقدار را دستی تغییر دهید.)
 */
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/';

const MIME_BY_EXT: Record<string, string> = {
  '.epub': 'application/epub+zip',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json',
};

/**
 * سرو کردن پوشه novels/ در توسعه و کپی آن در خروجی Build.
 * GitHub Pages فقط محتوای dist/ را می‌بیند؛ بنابراین کتاب‌ها باید همراه Build کپی شوند.
 */
function novelsPlugin(): Plugin {
  const novelsDir = path.resolve(__dirname, 'novels');
  return {
    name: 'novelshelf-novels',
    configureServer(server) {
      server.middlewares.use('/novels', (req, res, next) => {
        try {
          const rel = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (rel.includes('..') || rel.includes('\\')) return next();
          const filePath = path.join(novelsDir, rel);
          if (!filePath.startsWith(novelsDir)) return next();
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) return next();
          res.setHeader('Content-Type', MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Content-Length', String(stat.size));
          fs.createReadStream(filePath).pipe(res);
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      const dest = path.resolve(__dirname, 'dist', 'novels');
      if (fs.existsSync(novelsDir)) {
        fs.cpSync(novelsDir, dest, { recursive: true });
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), novelsPlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          epub: ['epubjs', 'jszip'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.*'],
  },
});
