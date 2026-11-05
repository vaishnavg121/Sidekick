/* global console */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await mkdir('playwright-report', { recursive: true });
const baselinePath = resolve('playwright-report/baseline-palette.ts');
await writeFile(
  baselinePath,
  execFileSync('git', ['show', 'ec6b73d:lib/command-palette.ts'], {
    encoding: 'utf8',
  }),
);
const before = await import(pathToFileURL(baselinePath).href),
  after = await import('../lib/command-palette.ts');
const measurements = [];
for (const count of [10, 50, 100, 210]) {
  const tabs = Array.from({ length: count }, (_, id) => ({
    id,
    windowId: 1,
    index: id,
    title: 'Research documentation ' + id,
    url: 'https://example.test/docs/' + id,
    active: id === 0,
    loading: false,
    restricted: false,
  }));
  const index = {
    tabs,
    workspaces: [],
    favorites: [],
    pinned: [],
    bookmarks: [],
    activeWorkspaceId: 'test',
  };
  const run = (fn) => {
    for (let i = 0; i < 100; i++) fn(index, 'doc' + i);
    const start = performance.now();
    for (let i = 0; i < 2000; i++) fn(index, 'doc' + (i % 200));
    return Number(((performance.now() - start) / 2000).toFixed(4));
  };
  measurements.push({
    tabs: count,
    baselineMsPerQuery: run(before.searchCommandPalette),
    currentMsPerQuery: run(after.searchCommandPalette),
  });
}
await writeFile(
  'playwright-report/palette-benchmark.json',
  JSON.stringify(measurements, null, 2),
);
console.log(JSON.stringify(measurements));
