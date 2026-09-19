#!/usr/bin/env node
/**
 * check-public-home-assets: verifies the /hi asset manifest.
 *
 * Preview mode (default): existence, non-empty files, webp/svg dimensions
 * available, referenced from guest code, authorization fields present, and
 * no placeholder/remote references. Unapproved records warn but pass.
 * Release mode (--release): any record without approvedBy+approvedAt fails.
 * Never invent approver/dates to pass the gate.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guestDir = join(root, 'public', 'adscale-guest');
const manifestPath = join(guestDir, 'asset-manifest.json');
const release = process.argv.includes('--release');
const failures = [];
const warnings = [];

function readWebpDimensions(path) {
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { width, height };
  }
  return null;
}

function readSvgDimensions(path) {
  const text = readFileSync(path, 'utf8');
  const width = text.match(/width="(\d+)"/)?.[1];
  const height = text.match(/height="(\d+)"/)?.[1];
  if (width && height) return { width: Number(width), height: Number(height) };
  const viewBox = text.match(/viewBox="[\d.\s-]+"/)?.[0];
  return viewBox ? { viewBox: true } : null;
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const guestSources = [
  readFileSync(join(root, 'src', 'components', 'guest-home', 'guest-markup.mjs'), 'utf8'),
  readFileSync(join(root, 'src', 'components', 'guest-home', 'guest-core.mjs'), 'utf8'),
  readFileSync(join(root, 'src', 'lib', 'public-studio-config.ts'), 'utf8'),
].join('\n');

for (const record of manifest.assets ?? []) {
  const label = record.file ?? '(missing file)';
  if (!record.file || !record.kind || !record.rights || !record.usedIn?.length) {
    failures.push(`${label}: missing file/kind/rights/usedIn`);
    continue;
  }
  if (!['illustrative', 'product-output'].includes(record.kind)) {
    failures.push(`${label}: kind must be illustrative or product-output`);
  }
  const full = join(guestDir, record.file);
  let size = 0;
  try {
    size = statSync(full).size;
  } catch {
    failures.push(`${label}: file does not exist`);
    continue;
  }
  if (size === 0) failures.push(`${label}: file is empty`);
  const dimensions = record.file.endsWith('.webp')
    ? readWebpDimensions(full)
    : record.file.endsWith('.svg')
      ? readSvgDimensions(full)
      : { skipped: true };
  if (!dimensions) failures.push(`${label}: dimensions unavailable`);
  const base = record.file.split('/').pop();
  if (!guestSources.includes(base)) failures.push(`${label}: not referenced from guest code`);
  if (/placeholder|todo|fixme|lorem|example\.com|unsplash|picsum/i.test(record.rights)) {
    failures.push(`${label}: rights look like a placeholder`);
  }
  if (/^https?:\/\//.test(record.file)) failures.push(`${label}: remote references are forbidden`);
  if (!record.approvedBy || !record.approvedAt) {
    const message = `${label}: not approved (approvedBy/approvedAt missing)`;
    if (release) failures.push(message);
    else warnings.push(message);
  }
}

// H04: the local alias target must exist and stay local (no remote fetch).
try {
  statSync(join(guestDir, 'legacy-assets'));
} catch {
  failures.push('legacy-assets: alias target dir does not exist');
}
if (!guestSources.includes('/adscale-guest/legacy-assets/')) {
  failures.push('legacy-assets: local rewrite target not found in config');
}

for (const warning of warnings) console.log(`WARN ${warning}`);
if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`guest-home-assets: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`guest-home-assets: ok (${manifest.assets.length} records${release ? ', release' : ''})`);
