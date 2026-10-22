import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (process.platform !== 'darwin') throw new Error('Build the macOS package on macOS.');
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
    extendInfo: { LSUIElement: true,
      NSAudioCaptureUsageDescription: 'Hiho 仅在你开启音乐律动时分析系统播放的声音，不保存或上传音频。',
      NSHumanReadableCopyright: 'Unofficial Jack Frost fan project. See bundled rights notices.' }
  });
  const bundle = join(output, 'Hiho.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
  const name = `Hiho-${metadata.version}-macOS-${process.arch}`;
  const distribution = join(stage, name);
  execFileSync('ditto', [output, distribution]);
  await cp(join(root, 'INSTALL-macOS.md'), join(distribution, 'INSTALL-macOS.md'));
  await cp(join(root, 'THIRD_PARTY.md'), join(distribution, 'THIRD_PARTY.md'));
  await cp(join(root, '..', 'LICENSE'), join(distribution, 'RIGHTS-NOTICE.txt'));
  const zip = join(root, 'out', `${name}.zip`);
  await rm(zip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', distribution, zip]);
  const checksum = createHash('sha256').update(await readFile(zip)).digest('hex');
  await writeFile(join(root, 'out', 'SHA256SUMS.txt'), `${checksum}  ${name}.zip\n`);
  console.log(`App: ${bundle}\nPackage: ${zip}\nSHA-256: ${checksum}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
