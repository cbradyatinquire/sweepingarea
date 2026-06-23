import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds index.html as a fully self-contained single-file HTML.
// Output goes to dist-app-single/ so it doesn't overwrite the main build.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-app-single',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
