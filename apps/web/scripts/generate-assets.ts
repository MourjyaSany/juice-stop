/**
 * Asset generator.
 *
 *   npx tsx scripts/generate-assets.ts [slug...]      # named slugs, or all when omitted
 *   GEN_PROVIDER=pollinations npx tsx scripts/...     # provider (default: pollinations)
 *
 * Writes into `public/generated/`. The app resolves assets by slug and falls back to a designed
 * gradient plate, so a partially generated set is a valid state — nothing breaks mid-run.
 *
 * Why a provider seam rather than a hardcoded URL: Higgsfield is the intended source but requires
 * paid credits. This lets a free endpoint fill the same slots today and be swapped for Higgsfield
 * later by changing one function, with no change to the app.
 *
 * Determinism: the seed is derived from the slug, so re-running reproduces the same image rather
 * than silently drifting the art direction on every invocation.
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
// Explicit .ts extension: this runs under Node's native type stripping, whose ESM resolver does
// not do extensionless lookup the way a bundler does.
import { ALL_ASSETS, type GeneratedAsset } from '../src/data/assets.ts';

const OUT_DIR = path.resolve(import.meta.dirname, '../public/generated');
const WIDTH = 768;
const HEIGHT = 768;

/** Stable 31-bit hash → reproducible seed per slug. */
function seedFor(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2_000_000;
}

interface Provider {
  name: string;
  extension: string;
  url: (asset: GeneratedAsset) => string;
}

const PROVIDERS: Record<string, Provider> = {
  pollinations: {
    name: 'pollinations.ai',
    extension: 'jpg',
    url: (asset) =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(asset.prompt)}` +
      `?width=${WIDTH}&height=${HEIGHT}&nologo=true&seed=${seedFor(asset.slug)}`,
  },
};

const provider = PROVIDERS[process.env['GEN_PROVIDER'] ?? 'pollinations'];
if (provider === undefined) {
  console.error(`Unknown provider. Available: ${Object.keys(PROVIDERS).join(', ')}`);
  process.exit(1);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function generate(asset: GeneratedAsset): Promise<'ok' | 'skip' | 'fail'> {
  const file = path.join(OUT_DIR, `${asset.slug}.${provider!.extension}`);

  // Never re-download. Generation is slow and, on a paid provider, costs money.
  if (await exists(file)) {
    console.log(`  · ${asset.slug.padEnd(14)} already present, skipped`);
    return 'skip';
  }

  const started = Date.now();
  try {
    const response = await fetch(provider!.url(asset), {
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    // A provider under load can return an HTML error page with a 200. Check the magic bytes
    // rather than trusting the status code, or the app ends up rendering a text file.
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    if (!isJpeg && !isPng) throw new Error('response was not an image');
    if (buffer.length < 4096) throw new Error(`suspiciously small (${buffer.length} bytes)`);

    await writeFile(file, buffer);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`  ✓ ${asset.slug.padEnd(14)} ${(buffer.length / 1024).toFixed(0)} KB in ${seconds}s`);
    return 'ok';
  } catch (error) {
    console.log(`  ✗ ${asset.slug.padEnd(14)} ${error instanceof Error ? error.message : 'failed'}`);
    return 'fail';
  }
}

async function main() {
  const wanted = process.argv.slice(2);
  const queue =
    wanted.length > 0
      ? ALL_ASSETS.filter((a) => wanted.includes(a.slug))
      : ALL_ASSETS;

  if (queue.length === 0) {
    console.error(`No matching slugs. Available: ${ALL_ASSETS.map((a) => a.slug).join(', ')}`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Generating ${queue.length} asset(s) via ${provider!.name} → public/generated/\n`);

  const tally = { ok: 0, skip: 0, fail: 0 };
  // Serial on purpose: free endpoints rate-limit aggressively, and a burst of parallel requests
  // gets throttled into failures that look like quality problems.
  for (const asset of queue) {
    tally[await generate(asset)]++;
  }

  console.log(`\nDone — ${tally.ok} generated, ${tally.skip} skipped, ${tally.fail} failed.`);
  if (tally.fail > 0) console.log('Re-run to retry only the failures (existing files are skipped).');
}

void main();
