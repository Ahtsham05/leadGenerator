import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAssets, type PageAssets } from '../src/analyzers/html/extractAssets.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function fixture(name: string): string {
  return readFileSync(path.join(dir, name), 'utf8');
}

export function fixtureJson(name: string): unknown {
  return JSON.parse(fixture(name));
}

export function fixtureAssets(name: string, url = 'https://example.com/'): PageAssets {
  return extractAssets(fixture(name), url);
}
