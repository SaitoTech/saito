import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'assets.json'), 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');

for (const asset of manifest.files) {
  const destination = path.join(root, 'web', asset.path);
  try {
    if (hash(await readFile(destination)) === asset.sha256) {
      console.log(`Verified ${asset.path}`);
      continue;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (process.argv.includes('--check')) throw new Error(`Missing or invalid asset: ${asset.path}`);
  console.log(`Downloading ${asset.path}`);
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`${response.status}: ${asset.url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (hash(data) !== asset.sha256) throw new Error(`Checksum mismatch: ${asset.path}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(`${destination}.tmp`, data);
  await rename(`${destination}.tmp`, destination);
}
console.log('Transcript assets ready. Deploy mods/transcript/web with the Saito server.');
