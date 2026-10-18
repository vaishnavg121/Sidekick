import type { SidebarMode } from './models';
import type { MetadataRepository } from './repository';
import type { WindowStateRepository } from './window-state';

export interface PanelApi {
  open(options: { windowId: number }): Promise<void>;
  close?: (options: { windowId: number }) => Promise<void>;
}
export class PanelService {
  private queue: Promise<unknown> = Promise.resolve();
  private generations = new Map<number, number>();
  private closingModes = new Map<number, Exclude<SidebarMode, 'pinned'>>();
  constructor(
    private api: PanelApi,
    private metadata: MetadataRepository,
    private windows: WindowStateRepository,
    private changed: () => void,
  ) {}
  private serial(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next.finally(this.changed);
  }
  pin(windowId: number): Promise<void> {
    const generation = this.generations.get(windowId) ?? 0;
    // Must be invoked synchronously in the message handler, before storage,
    // tabs.get, or any other await consumes Chrome's user-gesture context.
    const opening = this.api.open({ windowId });
    return opening.then(() =>
      this.serial(async () => {
        if (generation !== (this.generations.get(windowId) ?? 0)) return;
        await this.windows.update(windowId, {
          nativePanelOpen: true,
          notice: undefined,
        });
        await this.metadata.updatePreferences({ mode: 'pinned' });
      }),
    );
  }
  setMode(
    windowId: number,
    mode: Exclude<SidebarMode, 'pinned'>,
  ): Promise<void> {
    this.generations.set(windowId, (this.generations.get(windowId) ?? 0) + 1);
    this.closingModes.set(windowId, mode);
    return this.serial(async () => {
      const state = await this.windows.get(windowId);
      if (state.nativePanelOpen) {
        if (!this.api.close) {
          await this.windows.update(windowId, {
            notice:
              'Close Chrome’s side panel with its × button to finish returning to the webpage sidebar.',
          });
          await this.metadata.updatePreferences({ mode });
          return;
        }
        try {
          await this.api.close({ windowId });
        } catch {
          this.closingModes.delete(windowId);
          throw new Error(
            'Chrome could not close the side panel. Try again or use its × button.',
          );
        }
      } else this.closingModes.delete(windowId);
      await this.windows.update(windowId, {
        nativePanelOpen: false,
        notice: undefined,
      });
      await this.metadata.updatePreferences({ mode });
    });
  }
  opened(windowId: number): Promise<void> {
    return this.serial(async () => {
      await this.windows.update(windowId, {
        nativePanelOpen: true,
        notice: undefined,
      });
      if (!this.closingModes.has(windowId))
        await this.metadata.updatePreferences({ mode: 'pinned' });
    });
  }
  connected(windowId: number, documentId: string): Promise<void> {
    return this.serial(async () => {
      const previous = await this.windows.get(windowId);
      await this.windows.update(windowId, {
        nativePanelOpen: true,
        nativeDocumentId: documentId,
      });
      // Reconnecting after worker suspension is not a new request to pin.
      // Preserve legacy manual-close notices and the user's requested mode.
      if (!previous.nativePanelOpen && !this.closingModes.has(windowId))
        await this.metadata.updatePreferences({ mode: 'pinned' });
    });
  }
  closed(windowId: number): Promise<void> {
    this.generations.set(windowId, (this.generations.get(windowId) ?? 0) + 1);
    return this.serial(async () => {
      await this.windows.update(windowId, {
        nativePanelOpen: false,
        nativeDocumentId: undefined,
        notice: undefined,
      });
      const mode = this.closingModes.get(windowId);
      this.closingModes.delete(windowId);
      if (mode || (await this.metadata.get()).preferences.mode === 'pinned')
        await this.metadata.updatePreferences({ mode: mode ?? 'hover' });
    });
  }
}
