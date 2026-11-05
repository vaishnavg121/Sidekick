import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetadataRepository, type StorageArea } from '../lib/repository';
import {
  ProductivityService,
  isProductivityCommand,
} from '../lib/productivity';
import { createMetadata } from '../lib/models';
import { exportBackup, parseBackup, mergeBackup } from '../lib/backup';
import { emptyLibrary, snapshotPages } from '../lib/library';
import type { WorkspaceEngine } from '../lib/workspaces';
function memory(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    get: async (k) => structuredClone({ [k]: data[k] }),
    set: async (v) => {
      Object.assign(data, structuredClone(v));
    },
  };
}
describe('library, scheduling and safe recovery', () => {
  let repository: MetadataRepository,
    service: ProductivityService,
    workspaceId: string;
  const open = vi.fn(),
    remove = vi.fn(),
    create = vi.fn(),
    clear = vi.fn();
  beforeEach(async () => {
    vi.clearAllMocks();
    repository = new MetadataRepository(memory());
    workspaceId = (await repository.get()).activeWorkspaceId;
    const data: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      tabs: { remove },
      alarms: { create, clear },
      action: { setBadgeText: vi.fn() },
      permissions: { contains: async () => false },
      storage: {
        session: {
          get: async (k: string) => ({ [k]: data[k] }),
          set: async (v: object) => Object.assign(data, v),
          remove: async (k: string) => {
            delete data[k];
          },
        },
      },
    });
    const engine = {
      activeWorkspace: async () => workspaceId,
      snapshot: async () => ({
        workspaceId,
        tabs: [
          {
            id: 1,
            windowId: 1,
            title: 'Documentation',
            url: 'https://docs.example.com/',
          },
          {
            id: 2,
            windowId: 1,
            title: 'Code',
            url: 'https://code.example.com/',
          },
        ],
      }),
      open,
    } as unknown as WorkspaceEngine;
    service = new ProductivityService(repository, engine);
  });
  it('saves URL snapshots and restores selected pages, never stale Chrome IDs', async () => {
    await service.handle({ type: 'session.save', name: 'Development' }, 1);
    const session = (await repository.get()).library!.sessions[0]!;
    expect(session.pages).toHaveLength(2);
    expect(JSON.stringify(session)).not.toContain('tabId');
    await service.handle(
      {
        type: 'session.restore',
        id: session.id,
        urls: [session.pages[0]!.url],
      },
      1,
    );
    expect(open).toHaveBeenCalledExactlyOnceWith(
      1,
      session.pages[0]!.url,
      workspaceId,
    );
  });
  it('renames/deletes snapshots without closing live tabs', async () => {
    await service.handle({ type: 'session.save', name: 'Before' }, 1);
    const id = (await repository.get()).library!.sessions[0]!.id;
    await service.handle({ type: 'session.rename', id, name: 'After' }, 1);
    expect((await repository.get()).library!.sessions[0]!.name).toBe('After');
    await service.handle({ type: 'session.delete', id }, 1);
    expect((await repository.get()).library!.sessions).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });
  it('persists a snoozed page before explicitly requested closure and recreates alarms', async () => {
    await service.handle(
      {
        type: 'snooze.create',
        tabId: 1,
        dueAt: Date.now() + 3600000,
        close: true,
      },
      1,
    );
    const s = (await repository.get()).library!.snoozed[0]!;
    expect(create).toHaveBeenCalledWith('sidekick:snooze:' + s.id, {
      when: s.dueAt,
    });
    expect(remove).toHaveBeenCalledWith(1);
    await service.reconcileAlarms();
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('alarm marks a retained reminder ready without opening or stealing focus', async () => {
    await service.handle(
      {
        type: 'snooze.create',
        tabId: 1,
        dueAt: Date.now() + 3600000,
        close: false,
      },
      1,
    );
    const s = (await repository.get()).library!.snoozed[0]!;
    await service.due('sidekick:snooze:' + s.id);
    expect((await repository.get()).library!.snoozed[0]!.ready).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('restores a snoozed page then removes its reminder and alarm', async () => {
    await service.handle(
      {
        type: 'snooze.create',
        tabId: 1,
        dueAt: Date.now() + 3600000,
        close: false,
      },
      1,
    );
    const s = (await repository.get()).library!.snoozed[0]!;
    await service.handle({ type: 'snooze.restore', id: s.id }, 1);
    expect(open).toHaveBeenCalledWith(1, s.url, workspaceId);
    expect(clear).toHaveBeenCalledWith('sidekick:snooze:' + s.id);
    expect((await repository.get()).library!.snoozed).toEqual([]);
  });
  it('rejects invalid reminder dates and tabs from another workspace', async () => {
    await expect(
      service.handle(
        { type: 'snooze.create', tabId: 1, dueAt: 0, close: true },
        1,
      ),
    ).rejects.toThrow('future');
    await expect(
      service.handle({ type: 'archive.tab', tabId: 99, close: true }, 1),
    ).rejects.toThrow('workspace');
    expect(remove).not.toHaveBeenCalled();
  });
  it('archives a saved resource atomically, then safely restores its URL', async () => {
    await repository.authorResource('favorite', {
      workspaceId,
      title: 'Reference',
      url: 'https://example.com/',
    });
    const id = (await repository.get()).favorites[0]!.id;
    await service.handle({ type: 'archive.resource', kind: 'favorite', id }, 1);
    const m = await repository.get();
    expect(m.favorites).toEqual([]);
    expect(m.library!.archive).toHaveLength(1);
    await service.handle(
      { type: 'archive.restore', id: m.library!.archive[0]!.id },
      1,
    );
    expect(open).toHaveBeenCalledWith(1, 'https://example.com/', workspaceId);
  });
  it('keeps an archived copy when reopening fails', async () => {
    await service.handle({ type: 'archive.tab', tabId: 1, close: false }, 1);
    const id = (await repository.get()).library!.archive[0]!.id;
    open.mockRejectedValueOnce(Error('Browser closed'));
    await expect(
      service.handle({ type: 'archive.restore', id }, 1),
    ).rejects.toThrow();
    expect((await repository.get()).library!.archive).toHaveLength(1);
  });
  it('requires a same-window, unexpired import preview before any data changes', async () => {
    const before = await repository.get();
    await expect(
      service.handle({ type: 'backup.import', token: 'invented' }, 1),
    ).rejects.toThrow('Preview');
    const result = await service.handle(
      { type: 'backup.preview', text: JSON.stringify(exportBackup(before)) },
      1,
    );
    await expect(
      service.handle(
        { type: 'backup.import', token: result.preview!.token },
        2,
      ),
    ).rejects.toThrow('preview');
    expect((await repository.get()).workspaces).toHaveLength(1);
    await service.handle(
      { type: 'backup.import', token: result.preview!.token },
      1,
    );
    expect((await repository.get()).workspaces).toHaveLength(2);
    expect((await repository.get()).activeWorkspaceId).toBe(
      before.activeWorkspaceId,
    );
  });
  it('validates all productivity payloads before dispatch', () => {
    expect(
      isProductivityCommand({ type: 'session.restore', id: 'x', urls: [2] }),
    ).toBe(false);
    expect(
      isProductivityCommand({
        type: 'snooze.create',
        tabId: 1,
        dueAt: NaN,
        close: true,
      }),
    ).toBe(false);
    expect(
      isProductivityCommand({ type: 'archive.tab', tabId: 1, close: 'true' }),
    ).toBe(false);
    expect(isProductivityCommand({ type: 'session.save', name: ' ' })).toBe(
      false,
    );
  });
});
describe('portable backup boundaries', () => {
  it('excludes credentials, session identifiers, unknown fields and sensitive URL parameters', () => {
    const m = createMetadata();
    m.aiSettings = {
      connected: true,
      status: 'connected',
      gatewayKey: 'TEST_SECRET',
    };
    m.favorites = [
      {
        id: 'f',
        workspaceId: m.activeWorkspaceId,
        title: 'Saved',
        url: 'https://example.com/?token=PRIVATE&topic=docs',
        order: 0,
      },
    ];
    const json = JSON.stringify(exportBackup(m));
    expect(json).not.toContain('TEST_SECRET');
    expect(json).not.toContain('PRIVATE');
    expect(json).not.toContain('aiSettings');
    expect(json).toContain('topic=docs');
  });
  it('imports legacy metadata as new independent workspace copies without overriding preferences', () => {
    const m = createMetadata(),
      old = createMetadata();
    old.preferences.width = 440;
    const next = mergeBackup(m, parseBackup(JSON.stringify(old)));
    expect(next.preferences).toEqual(m.preferences);
    expect(next.workspaces[0]).toEqual(m.workspaces[0]);
    expect(next.workspaces[1]!.id).not.toBe(old.activeWorkspaceId);
  });
  it('rejects corrupted, unsupported, oversized and cyclic data without mutation', () => {
    for (const text of [
      'bad',
      JSON.stringify({ format: 'sidekick-backup', version: 999 }),
      'x'.repeat(5_000_001),
    ])
      expect(() => parseBackup(text)).toThrow();
    const m = createMetadata();
    m.folders = [
      {
        id: 'cycle',
        workspaceId: m.activeWorkspaceId,
        parentId: 'cycle',
        name: 'Unsafe',
        order: 0,
      },
    ];
    expect(() => parseBackup(JSON.stringify(m))).toThrow();
  });
  it('validates library references and disallows script URLs in imported pages', () => {
    const m = createMetadata();
    m.library = {
      ...emptyLibrary(),
      archive: [
        {
          id: 'x',
          workspaceId: m.activeWorkspaceId,
          title: 'Unsafe',
          url: 'javascript:alert(1)',
          createdAt: '',
        },
      ],
    };
    expect(() => parseBackup(JSON.stringify(m))).toThrow();
  });
  it('deduplicates saved session pages by exact safe identity', () => {
    expect(
      snapshotPages([
        { title: 'A', url: 'https://example.com/' },
        { title: 'B', url: 'https://example.com/' },
        { title: 'Unsafe', url: 'javascript:x' },
        { title: 'Different session', url: 'https://example.com/?session=2' },
      ]),
    ).toHaveLength(2);
  });
});
