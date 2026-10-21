import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('Build the macOS preview on macOS.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = await mkdtemp(join(tmpdir(), 'hiho-package-'));
try {
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  delete metadata.devDependencies;
  delete metadata.scripts;
  await writeFile(join(stage, 'package.json'), JSON.stringify(metadata, null, 2));
  await mkdir(join(stage, 'dist', 'src'), { recursive: true });
  await cp(join(root, 'dist', 'src'), join(stage, 'dist', 'src'), { recursive: true });
  for (const name of ['LICENSE', 'THIRD_PARTY.md']) await cp(join(root, name), join(stage, name));
  const [output] = await packager({
    dir: stage, out: join(root, 'out'), name: 'Hiho', platform: 'darwin', arch: process.arch,
    electronVersion: JSON.parse(await readFile(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    appBundleId: 'io.github.VictorHugo043.HihoPet', appVersion: metadata.version,
    appCategoryType: 'public.app-category.entertainment',
    icon: join(root, 'assets', 'Hiho.icns'), asar: true, overwrite: true,
    extendInfo: { LSUIElement: true, NSHumanReadableCopyright: 'Unofficial Jack Frost fan project. See bundled rights notices.' }
  });
  const bundle = join(output, 'Hiho.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
  const zip = join(root, 'out', `Hiho-macOS-${process.arch}.zip`);
  await rm(zip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, zip]);
  console.log(`App: ${bundle}\nPreview: ${zip}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
