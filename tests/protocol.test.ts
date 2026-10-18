import { expect, it } from 'vitest';
import { isCommand } from '../lib/protocol';
it('rejects malformed or expanded message capabilities', () => {
  for (const c of [
    null,
    {},
    { type: 'tab.close', tabId: -1 },
    { type: 'tab.close', tabId: '1' },
    { type: 'preferences.update', patch: { apiKey: 'secret' } },
    { type: 'preferences.update', patch: { width: Infinity } },
    { type: 'preferences.update', patch: { mode: 'invalid' } },
    { type: 'tab.navigate', url: 'javascript:alert(1)' },
  ])
    expect(isCommand(c)).toBe(false);
  expect(
    isCommand({
      type: 'preferences.update',
      patch: { mode: 'pinned', width: 310 },
    }),
  ).toBe(true);
});
