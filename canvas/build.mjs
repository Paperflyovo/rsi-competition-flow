import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
// The official canvas declares React 16 peers; the host runs React 19.
const alias = Object.fromEntries(
  Object.keys(manifest.dependencies).map((name) => [
    name,
    path.join(directory, 'node_modules', name),
  ]),
);
await build({
  absWorkingDir: directory,
  entryPoints: ['editor.jsx'],
  outfile: '../public/flow-editor/editor.js',
  bundle: true,
  minify: true,
  alias,
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  target: 'es2020',
});
