import { describe, expect, it, vi } from 'vitest';
import { PanelService } from '../lib/panel-service';
import { MetadataRepository, type StorageArea } from '../lib/repository';
import { WindowStateRepository } from '../lib/window-state';
function memory(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(key) {
      return structuredClone({ [key]: data[key] });
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
  };
}
function setup(
  close: (() => Promise<void>) | undefined = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  const metadata = new MetadataRepository(memory());
  const session = memory();
  const windows = new WindowStateRepository(session);
  const open = vi
    .fn<(options: { windowId: number }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const api: { open: typeof open; close?: () => Promise<void> } = {
    open,
    close,
  };
  const changed = vi.fn();
  return {
    metadata,
    windows,
    session,
    api,
    changed,
    service: new PanelService(api, metadata, windows, changed),
  };
}
describe('native panel coordination', () => {
  it('opens synchronously before storage to preserve the user gesture, then saves pinned', async () => {
    const s = setup();
    const reading = vi.spyOn(s.metadata, 'get');
    const pinned = s.service.pin(7);
    expect(s.api.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(reading).not.toHaveBeenCalled();
    await pinned;
    expect((await s.metadata.get()).preferences.mode).toBe('pinned');
    expect((await s.windows.get(7)).nativePanelOpen).toBe(true);
    expect((await s.windows.get(8)).nativePanelOpen).toBe(false);
  });
  it('preserves hover mode if Chrome rejects opening', async () => {
    const s = setup();
    s.api.open.mockRejectedValue(new Error('Gesture required'));
    await expect(s.service.pin(1)).rejects.toThrow('Gesture required');
    expect((await s.metadata.get()).preferences.mode).toBe('hover');
    expect((await s.windows.get(1)).nativePanelOpen).toBe(false);
  });
  it('handles close and hidden-mode races without restoring pinned or hover', async () => {
    const s = setup();
    await s.service.pin(1);
    await Promise.all([s.service.setMode(1, 'hidden'), s.service.closed(1)]);
    expect((await s.metadata.get()).preferences.mode).toBe('hidden');
    expect((await s.windows.get(1)).nativePanelOpen).toBe(false);
    await s.service.opened(1);
    expect((await s.metadata.get()).preferences.mode).toBe('pinned');
    await s.service.closed(1);
    expect((await s.metadata.get()).preferences.mode).toBe('hover');
  });
  it('does not enable an overlay when old Chrome cannot close its native panel', async () => {
    const s = setup();
    s.api.close = undefined;
    await s.service.pin(1);
    await s.service.setMode(1, 'hover');
    expect((await s.metadata.get()).preferences.mode).toBe('hover');
    expect(await s.windows.get(1)).toMatchObject({
      nativePanelOpen: true,
      notice: expect.stringContaining('×'),
    });
    await s.service.closed(1);
    expect((await s.windows.get(1)).nativePanelOpen).toBe(false);
  });
  it('keeps native mode on close failure and permits retry', async () => {
    const close = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(undefined);
    const s = setup(close);
    await s.service.pin(1);
    await expect(s.service.setMode(1, 'hover')).rejects.toThrow(
      'could not close',
    );
    expect((await s.metadata.get()).preferences.mode).toBe('pinned');
    expect((await s.windows.get(1)).nativePanelOpen).toBe(true);
    await s.service.setMode(1, 'hover');
    expect((await s.metadata.get()).preferences.mode).toBe('hover');
  });
  it('does not restore a pending pin after a close/mode change', async () => {
    const s = setup();
    let resolve!: () => void;
    s.api.open.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const pinning = s.service.pin(1);
    await s.service.setMode(1, 'hidden');
    resolve();
    await pinning;
    expect((await s.metadata.get()).preferences.mode).toBe('hidden');
  });
  it('serializes independent window state and survives worker repository recreation', async () => {
    const s = setup();
    await Promise.all([
      s.windows.update(1, { query: 'one' }),
      s.windows.update(2, { query: 'two' }),
      s.windows.update(1, { nativePanelOpen: true }),
    ]);
    const restarted = new WindowStateRepository(s.session);
    expect(await restarted.get(1)).toMatchObject({
      query: 'one',
      nativePanelOpen: true,
    });
    expect(await restarted.get(2)).toMatchObject({
      query: 'two',
      nativePanelOpen: false,
    });
    await restarted.remove(1);
    expect((await restarted.get(1)).query).toBe('');
  });
  it('preserves a legacy unpin request when the native document reconnects after worker restart', async () => {
    const s = setup();
    s.api.close = undefined;
    await s.service.pin(1);
    await s.service.connected(1, 'native-doc');
    await s.service.setMode(1, 'hidden');
    const restarted = new PanelService(s.api, s.metadata, s.windows, s.changed);
    await restarted.connected(1, 'native-doc');
    expect((await s.metadata.get()).preferences.mode).toBe('hidden');
    expect(await s.windows.get(1)).toMatchObject({
      nativePanelOpen: true,
      nativeDocumentId: 'native-doc',
      notice: expect.stringContaining('×'),
    });
  });
});
