import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Reads the pre-built single-file app HTML and injects it into offline.html
// as window.__APP_HTML__, so the iframe can use srcdoc and need no server.
const injectAppHtml = () => ({
  name: 'inject-app-html',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string): string {
      const appHtml = readFileSync('dist-app-single/index.html', 'utf-8');
      // Base64-encode the app HTML so no characters in the string are special
      // in HTML or JavaScript — avoids </script> injection and quote escaping issues.
      const b64 = Buffer.from(appHtml, 'utf-8').toString('base64');
      return html.replace(
        'window.__APP_HTML__ = null;',
        `window.__APP_HTML__ = atob("${b64}");`,
      );
    },
  },
});

export default defineConfig({
  plugins: [injectAppHtml(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        offline: resolve(__dirname, 'offline.html'),
      },
    },
  },
});
