import { describe, expect, it } from 'vitest';
import {
  createMetadata,
  normalizePreferences,
  validateFolders,
  type Folder,
} from '../lib/models';
import { isMetadata } from '../lib/repository';
describe('workspace models', () => {
  it('creates durable unique workspace identities and no browser handles', () => {
    const first = createMetadata();
    expect(first.activeWorkspaceId).toBe(first.workspaces[0]?.id);
    expect(first.activeWorkspaceId).not.toBe(
      createMetadata().activeWorkspaceId,
    );
    expect(isMetadata(first)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(
      /tabId|groupId|password|token|key/i,
    );
  });
  it('clamps malformed preferences', () => {
    expect(
      normalizePreferences({ width: 999, openDelay: -20, closeDelay: NaN }),
    ).toEqual({ mode: 'hover', width: 440, openDelay: 0, closeDelay: 350 });
    expect(
      normalizePreferences({ mode: 'broken' as 'hover', width: Infinity })
        .width,
    ).toBe(300);
  });
  it('rejects cycles, missing parents and cross-workspace folder nesting', () => {
    const folder = (
      id: string,
      parentId: string | null,
      workspaceId = 'w',
    ): Folder => ({ id, parentId, workspaceId, name: id, order: 0 });
    const ids = new Set(['w', 'other']);
    expect(validateFolders([folder('a', null), folder('b', 'a')], ids)).toBe(
      true,
    );
    expect(validateFolders([folder('a', 'b'), folder('b', 'a')], ids)).toBe(
      false,
    );
    expect(validateFolders([folder('a', 'missing')], ids)).toBe(false);
    expect(
      validateFolders([folder('a', null), folder('b', 'a', 'other')], ids),
    ).toBe(false);
    expect(validateFolders([folder('a', null), folder('a', null)], ids)).toBe(
      false,
    );
  });
  it('rejects malformed workspace records and orphaned pinned entries', () => {
    const m = createMetadata();
    expect(isMetadata({ ...m, workspaces: [null] })).toBe(false);
    expect(isMetadata({ ...m, activeWorkspaceId: 'missing' })).toBe(false);
    expect(isMetadata({ ...m, folders: [null] })).toBe(false);
    expect(
      isMetadata({
        ...m,
        pinnedEntries: [
          {
            id: 'p',
            workspaceId: m.activeWorkspaceId,
            title: 'p',
            url: 'https://example.com',
            order: 0,
            folderId: 'missing',
          },
        ],
      }),
    ).toBe(false);
  });
});
