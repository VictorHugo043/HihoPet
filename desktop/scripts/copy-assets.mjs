import { cp, mkdir, rm } from 'node:fs/promises';

await mkdir('dist/src', { recursive: true });
for (const name of ['index.html', 'style.css', 'music.html', 'music.css']) await cp(`src/${name}`, `dist/src/${name}`);
await rm('dist/src/assets', { recursive: true, force: true });
await cp('assets', 'dist/src/assets', { recursive: true });
