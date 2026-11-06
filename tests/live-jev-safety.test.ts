import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const runner = resolve('scripts/live-jev.mjs');
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function run(
  budget: object,
  args: string[] = [],
  credential?: string,
  live = true,
) {
  const directory = mkdtempSync(join(tmpdir(), 'sidekick-live-preflight-'));
  directories.push(directory);
  mkdirSync(join(directory, '.output'));
  writeFileSync(
    join(directory, '.output/live-jev-budget.json'),
    JSON.stringify(budget),
  );
  if (credential) {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    writeFileSync(join(directory, '.gitignore'), '.env.e2e.local\n');
    writeFileSync(
      join(directory, '.env.e2e.local'),
      `AI_GATEWAY_API_KEY=${credential}\n`,
    );
  }
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: directory,
    env: {
      ...process.env,
      SIDEKICK_LIVE: live ? '1' : '0',
      AI_GATEWAY_API_KEY: '',
    },
    encoding: 'utf8',
    timeout: 8000,
  });
  expect(result.signal).toBeNull();
  return {
    ...result,
    directory,
    budget: JSON.parse(
      readFileSync(join(directory, '.output/live-jev-budget.json'), 'utf8'),
    ),
  };
}
describe('live campaign preflight without network or real credentials', () => {
  const halted = { used: 2, maximum: 25, halted: true, stopStatus: 403 };
  it('defaults to skip and preserves the campaign', () => {
    const result = run(halted, [], undefined, false);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SKIPPED');
    expect(result.budget).toEqual(halted);
  });
  it.each([[], ['--resume', '--expected-used=1']])(
    'rejects absent or stale explicit resume: %j',
    (...args) => {
      const result = run(halted, args as string[]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('explicit --resume');
      expect(result.budget).toEqual(halted);
    },
  );
  it.each([
    { used: 25, maximum: 25, halted: true },
    { used: -1, maximum: 25, halted: true },
    { used: 1.5, maximum: 25, halted: true },
    { used: 2, maximum: 30, halted: true },
  ])('rejects an invalid or exhausted ledger: %j', (budget) => {
    const result = run(budget, ['--resume', `--expected-used=${budget.used}`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid or exhausted');
    expect(result.budget).toEqual(budget);
  });
  it('rejects account-correction attestation without explicit resume', () => {
    const result = run(halted, ['--access-fixed']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--access-fixed requires');
    expect(result.budget).toEqual(halted);
  });
  it('blocks a template credential before Chrome starts', () => {
    const result = run(
      halted,
      ['--resume', '--expected-used=2'],
      'your_gateway_key_here',
    );
    expect(result.status).toBe(1);
    expect(result.budget).toEqual(halted);
    const report = JSON.parse(
      readFileSync(
        join(result.directory, '.output/live-jev-report.json'),
        'utf8',
      ),
    );
    expect(report).toMatchObject({
      stage: 'setup',
      status: 'BLOCKED',
      requestsThisRun: 0,
    });
  });
  it('blocks the same rejected credential even with explicit resume', () => {
    const credential =
      'vck_synthetic_rejected_credential_for_offline_preflight';
    const budget = {
      ...halted,
      rejectedCredentialFingerprint: createHash('sha256')
        .update(credential)
        .digest('hex'),
    };
    const result = run(budget, ['--resume', '--expected-used=2'], credential);
    expect(result.status).toBe(1);
    expect(result.budget).toEqual(budget);
    const report = JSON.parse(
      readFileSync(
        join(result.directory, '.output/live-jev-report.json'),
        'utf8',
      ),
    );
    expect(report).toMatchObject({
      stage: 'setup',
      status: 'BLOCKED',
      requestsThisRun: 0,
    });
    expect(result.stdout).not.toContain(credential);
  });
});
