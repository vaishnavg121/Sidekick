/* global console, process */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { parseEnv } from 'node:util';
import { resolve, join, sep } from 'node:path';
const ignored =
  execFileSync('git', ['check-ignore', '.env.e2e.local'], {
    encoding: 'utf8',
  }).trim() === '.env.e2e.local';
if (!ignored) throw Error('Local live-test credentials must remain ignored.');
const secrets = existsSync('.env.e2e.local')
  ? Object.entries(parseEnv(await readFile('.env.e2e.local', 'utf8')))
      .filter(([name]) =>
        ['AI_GATEWAY_API_KEY', 'TYPESAFE_API_KEY'].includes(name),
      )
      .map(([, value]) => value.trim())
      .filter(Boolean)
  : [];
const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
async function walk(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) result.push(...(await walk(path)));
    else if (e.isFile()) result.push(path);
  }
  return result;
}
const build = await walk(resolve('.output/chrome-mv3'));
if (process.argv[2]) {
  const packaged = resolve(process.argv[2]);
  if (!packaged.startsWith(resolve('playwright-report') + sep))
    throw Error('Extract the ZIP inside playwright-report.');
  build.push(...(await walk(packaged)));
}
let count = 0;
for (const file of [
  ...new Set([
    ...tracked,
    ...build,
    ...(await readdir('.')).filter((n) => n.endsWith('.log')),
    '.output/live-jev-report.json',
    '.output/live-jev-budget.json',
  ]),
]) {
  if (!existsSync(file)) continue;
  const data = await readFile(file);
  count++;
  if (secrets.some((key) => data.includes(Buffer.from(key))))
    throw Error(
      'Credential found in an audited file. No credential was printed.',
    );
}
const forbidden = [
  'isolated-contract-test-key',
  'isolated-mock-contract-key',
  'fixture-not-a-live-key',
  'http://127.0.0.1',
  'http://localhost',
];
for (const file of build) {
  const data = await readFile(file);
  if (forbidden.some((s) => data.includes(Buffer.from(s))))
    throw Error('Test-only data found in production output.');
  if (file.endsWith('.map'))
    throw Error('Unexpected source map in release output.');
}
const report = {
  status: 'PASS',
  filesScanned: count,
  credentialFileIgnored: true,
  localCredentialComparedWithoutDisclosure: secrets.length > 0,
  noCredentialFound: true,
  noTestCredentialsOrLoopbackEndpointsInBuild: true,
};
await writeFile('.output/security-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
