import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/src', { recursive: true });
for (const name of ['index.html', 'style.css']) await cp(`src/${name}`, `dist/src/${name}`);
await cp('assets', 'dist/src/assets', { recursive: true });
