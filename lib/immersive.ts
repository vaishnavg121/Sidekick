import { WindowStateRepository } from './window-state';

type State =
  'normal' | 'maximized' | 'minimized' | 'fullscreen' | 'locked-fullscreen';
interface WindowInfo {
  state?: State;
  type?: string;
}
interface WindowsApi {
  get(id: number): Promise<WindowInfo>;
  update(
    id: number,
    options: { state: 'normal' | 'maximized' | 'fullscreen' },
  ): Promise<WindowInfo>;
}

// The browser owns fullscreen. Session state only records a recoverable return
// state; neither installation nor worker/browser startup ever enters fullscreen.
export class ImmersiveController {
  private queues = new Map<number, Promise<unknown>>();
  constructor(
    private api: WindowsApi,
    private repository: WindowStateRepository,
    private changed: () => void,
  ) {}
  private serial<T>(id: number, action: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(id) ?? Promise.resolve()).then(
      action,
      action,
    );
    this.queues.set(id, next);
    void next
      .finally(() => {
        if (this.queues.get(id) === next) this.queues.delete(id);
      })
      .catch(() => undefined);
    return next;
  }
  synchronize(id: number): Promise<void> {
    return this.serial(id, async () => {
      const window = await this.api.get(id);
      const saved = await this.repository.get(id);
      const immersive = window.state === 'fullscreen';
      if (saved.immersive !== immersive || (!immersive && saved.restoreState)) {
        await this.repository.update(id, {
          immersive,
          restoreState: immersive ? saved.restoreState : undefined,
        });
        this.changed();
      }
    });
  }
  enter(id: number): Promise<void> {
    return this.serial(id, async () => {
      const window = await this.api.get(id);
      if (window.type !== 'normal')
        throw new Error('Immersive mode requires a regular Chrome window.');
      if (window.state === 'fullscreen') {
        await this.repository.update(id, { immersive: true });
        this.changed();
        return;
      }
      if (window.state !== 'normal' && window.state !== 'maximized')
        throw new Error('Restore this window before entering immersive mode.');
      await this.repository.update(id, { restoreState: window.state });
      try {
        const result = await this.api.update(id, { state: 'fullscreen' });
        if (result.state !== 'fullscreen')
          throw new Error('Chrome did not enter fullscreen.');
        await this.repository.update(id, { immersive: true });
      } catch {
        // Check the browser again: a storage failure must not hide Exit.
        const actual = await this.api.get(id);
        await this.repository.update(id, {
          immersive: actual.state === 'fullscreen',
          restoreState:
            actual.state === 'fullscreen' ? window.state : undefined,
        });
        throw new Error(
          'Immersive mode could not be completed. Use Exit Immersive or F11 if Chrome is fullscreen.',
        );
      } finally {
        this.changed();
      }
    });
  }
  exit(id: number): Promise<void> {
    return this.serial(id, async () => {
      const actual = await this.api.get(id);
      if (actual.state === 'locked-fullscreen')
        throw new Error(
          'This managed window cannot leave fullscreen. Contact your administrator.',
        );
      if (actual.state === 'fullscreen') {
        const saved = await this.repository.get(id);
        const result = await this.api.update(id, {
          state: saved.restoreState ?? 'normal',
        });
        if (result.state === 'fullscreen')
          throw new Error(
            'Chrome could not leave fullscreen. Press F11 (or Fn+F11).',
          );
      }
      await this.repository.update(id, {
        immersive: false,
        restoreState: undefined,
      });
      this.changed();
    });
  }
}
