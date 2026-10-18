import { describe, expect, it, vi } from 'vitest';
import { ImmersiveController } from '../lib/immersive';
import { WindowStateRepository } from '../lib/window-state';
import type { StorageArea } from '../lib/repository';

function setup() {
  const values: Record<string, unknown> = {};
  const area: StorageArea = {
    async get(key) {
      return structuredClone({ [key]: values[key] });
    },
    async set(items) {
      Object.assign(values, structuredClone(items));
    },
  };
  const repository = new WindowStateRepository(area);
  const states = new Map<
    number,
    'normal' | 'maximized' | 'fullscreen' | 'minimized'
  >([
    [1, 'normal'],
    [2, 'maximized'],
  ]);
  const api = {
    get: vi.fn(async (id: number) => ({
      type: 'normal',
      state: states.get(id),
    })),
    update: vi.fn(
      async (
        id: number,
        options: { state: 'normal' | 'maximized' | 'fullscreen' },
      ) => {
        states.set(id, options.state);
        return { type: 'normal', state: options.state };
      },
    ),
  };
  const changed = vi.fn();
  return {
    area,
    repository,
    states,
    api,
    changed,
    controller: new ImmersiveController(api, repository, changed),
  };
}
describe('immersive controller', () => {
  it('refuses popup and managed locked fullscreen windows without changing them', async () => {
    const s = setup();
    const update = vi.fn(async () => ({ state: 'normal' as const }));
    const popup = new ImmersiveController(
      { get: async () => ({ type: 'popup', state: 'normal' }), update },
      s.repository,
      s.changed,
    );
    await expect(popup.enter(1)).rejects.toThrow('regular Chrome window');
    const managed = new ImmersiveController(
      {
        get: async () => ({ type: 'normal', state: 'locked-fullscreen' }),
        update,
      },
      s.repository,
      s.changed,
    );
    await expect(managed.exit(1)).rejects.toThrow('administrator');
    expect(update).not.toHaveBeenCalled();
  });
  it('never enters on synchronization and restores independent normal/maximized windows', async () => {
    const s = setup();
    await s.controller.synchronize(1);
    expect(s.api.update).not.toHaveBeenCalled();
    await Promise.all([s.controller.enter(1), s.controller.enter(2)]);
    expect((await s.repository.get(1)).restoreState).toBe('normal');
    expect((await s.repository.get(2)).restoreState).toBe('maximized');
    await s.controller.exit(1);
    expect(s.states.get(1)).toBe('normal');
    expect(s.states.get(2)).toBe('fullscreen');
    await s.controller.exit(2);
    expect(s.states.get(2)).toBe('maximized');
  });
  it('survives a worker restart without replacing the saved return state', async () => {
    const s = setup();
    await s.controller.enter(2);
    const restarted = new ImmersiveController(
      s.api,
      new WindowStateRepository(s.area),
      s.changed,
    );
    await restarted.synchronize(2);
    await restarted.enter(2);
    await restarted.exit(2);
    expect(s.states.get(2)).toBe('maximized');
  });
  it('reconciles manual exit and safely exits external fullscreen with no saved state', async () => {
    const s = setup();
    await s.controller.enter(2);
    s.states.set(2, 'normal');
    await s.controller.synchronize(2);
    expect(await s.repository.get(2)).toMatchObject({
      immersive: false,
      restoreState: undefined,
    });
    s.states.set(1, 'fullscreen');
    await s.controller.synchronize(1);
    expect((await s.repository.get(1)).immersive).toBe(true);
    await s.controller.exit(1);
    expect(s.states.get(1)).toBe('normal');
  });
  it('serializes rapid enter/exit and refuses minimized windows', async () => {
    const s = setup();
    await Promise.all([
      s.controller.enter(1),
      s.controller.enter(1),
      s.controller.exit(1),
    ]);
    expect(s.states.get(1)).toBe('normal');
    s.states.set(1, 'minimized');
    await expect(s.controller.enter(1)).rejects.toThrow('Restore this window');
  });
  it('preserves recovery after rejected window changes and allows retry', async () => {
    const s = setup();
    s.api.update.mockRejectedValueOnce(new Error('denied'));
    await expect(s.controller.enter(1)).rejects.toThrow('F11');
    expect((await s.repository.get(1)).immersive).toBe(false);
    await s.controller.enter(1);
    s.api.update.mockRejectedValueOnce(new Error('denied'));
    await expect(s.controller.exit(1)).rejects.toThrow('denied');
    expect((await s.repository.get(1)).immersive).toBe(true);
    await s.controller.exit(1);
    expect(s.states.get(1)).toBe('normal');
  });
  it('runs an already queued Exit even when the preceding Enter fails', async () => {
    const s = setup();
    s.api.update.mockRejectedValueOnce(new Error('denied'));
    const entering = s.controller.enter(1);
    const exiting = s.controller.exit(1);
    await expect(entering).rejects.toThrow('F11');
    await expect(exiting).resolves.toBeUndefined();
    expect(s.states.get(1)).toBe('normal');
    expect((await s.repository.get(1)).immersive).toBe(false);
  });
});
