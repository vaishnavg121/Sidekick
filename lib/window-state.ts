import type { StorageArea } from './repository';

export interface WindowUiState {
  query: string;
  nativePanelOpen: boolean;
  immersive: boolean;
  restoreState?: 'normal' | 'maximized';
  nativeDocumentId?: string;
  notice?: string;
}
export const EMPTY_WINDOW_STATE: WindowUiState = {
  query: '',
  nativePanelOpen: false,
  immersive: false,
};
const KEY = 'sidekick.window-ui.v1';

// Session-only window handles and search state survive worker suspension, but
// never become durable workspace identities or survive a browser restart.
export class WindowStateRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private area: StorageArea) {}
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async read(): Promise<Record<string, WindowUiState>> {
    return (
      ((await this.area.get(KEY))[KEY] as
        Record<string, WindowUiState> | undefined) ?? {}
    );
  }
  get(windowId: number): Promise<WindowUiState> {
    return this.serial(async () => ({
      ...EMPTY_WINDOW_STATE,
      ...(await this.read())[windowId],
    }));
  }
  update(windowId: number, patch: Partial<WindowUiState>): Promise<void> {
    return this.serial(async () => {
      const values = await this.read();
      values[windowId] = {
        ...EMPTY_WINDOW_STATE,
        ...values[windowId],
        ...patch,
      };
      // Chrome's JSON serialization drops undefined fields.
      if (values[windowId]?.notice === undefined)
        delete values[windowId]!.notice;
      await this.area.set({ [KEY]: values });
    });
  }
  remove(windowId: number): Promise<void> {
    return this.serial(async () => {
      const values = await this.read();
      delete values[windowId];
      await this.area.set({ [KEY]: values });
    });
  }
}
