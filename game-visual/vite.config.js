import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Serve the actual shared workbook in development; bundle a snapshot for deployment.
const workbook = fileURLToPath(new URL('../data/output/nearby_30ly/nearby_stars.xlsx', import.meta.url));
export default defineConfig({
  base: './',
  plugins: [{
    name: 'shared-star-workbook',
    configureServer(server) {
      server.middlewares.use('/catalog.xlsx', async (_request, response) => {
        try {
          response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          response.setHeader('Cache-Control', 'no-store');
          response.end(await readFile(workbook));
        } catch {
          response.statusCode = 404;
          response.end('Run data/nearby_stars.py to generate the workbook, or use Open workbook.');
        }
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'catalog.xlsx', source: await readFile(workbook) });
    }
  }],
  build: { target: 'es2022' }
});
