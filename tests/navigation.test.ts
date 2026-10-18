import { describe, expect, it } from 'vitest';
import { resolveAddress, safeUrl } from '../lib/navigation';
import { isCommand } from '../lib/protocol';
describe('navigation boundary', () => {
  it('recognizes addresses, domains, localhost ports, international domains and searches', () => {
    expect(resolveAddress('https://example.com/a?b=c')).toBe(
      'https://example.com/a?b=c',
    );
    expect(resolveAddress(' example.com/path ')).toBe(
      'https://example.com/path',
    );
    expect(resolveAddress('localhost:3000')).toBe('https://localhost:3000/');
    expect(resolveAddress('bücher.de')).toBe('https://xn--bcher-kva.de/');
    expect(resolveAddress('a quiet garden & tea')).toBe(
      'https://www.google.com/search?q=a%20quiet%20garden%20%26%20tea',
    );
    expect(resolveAddress('chrome://settings')).toBe('chrome://settings');
  });
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,test',
    'file:///C:/secret',
    'chrome-extension://id/a',
    'vbscript:msgbox(1)',
    'https://user:password@example.com',
    'https://example.com\n/a',
    'chrome://crash',
    '',
  ])('rejects unsafe or empty input %s', (input) => {
    expect(() => resolveAddress(input)).toThrow();
  });
  it('does not treat unsafe bookmark URLs as searches', () => {
    expect(() => safeUrl('javascript:alert(1)')).toThrow();
    expect(() => safeUrl('some words')).toThrow();
  });
  it('validates navigation and bookmark/favorite messages before dispatch', () => {
    expect(isCommand({ type: 'navigation.action', action: 'execute' })).toBe(
      false,
    );
    expect(
      isCommand({ type: 'navigation.go', input: 'example.com', newTab: 'yes' }),
    ).toBe(false);
    expect(
      isCommand({
        type: 'favorite.save',
        title: 'x',
        url: 'https://example.com',
        workspaceId: 'w',
      }),
    ).toBe(true);
    expect(isCommand({ type: 'bookmarks.read', query: 42 })).toBe(false);
  });
});
