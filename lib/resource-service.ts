import type { MetadataRepository } from './repository';
import type { AuthorCommand } from './protocol';
import { collection, resourceKey } from './resources';
export class ResourceService {
  private queues = new Map<number, Promise<unknown>>();
  constructor(private repository: MetadataRepository) {}
  async handle(command: AuthorCommand, windowId: number): Promise<void> {
    switch (command.type) {
      case 'resource.save':
        await this.repository.authorResource(command.kind, command.input);
        break;
      case 'resource.remove':
        await this.repository.removeResource(command.kind, command.id);
        break;
      case 'resource.move':
        await this.repository.moveResource(
          command.kind,
          command.id,
          command.workspaceId,
          command.folderId,
        );
        break;
      case 'resource.reorder':
        await this.repository.reorder(
          command.kind,
          command.workspaceId,
          command.ids,
          command.folderId,
        );
        break;
      case 'workspace.save':
        await this.repository.authorWorkspace(command.input);
        break;
      case 'folder.save':
        await this.repository.authorFolder(command.input);
        break;
      case 'folder.remove':
        await this.repository.removeFolder(command.id);
        break;
      case 'resource.current': {
        const tab =
          command.tabId !== undefined
            ? await chrome.tabs.get(command.tabId)
            : (await chrome.tabs.query({ windowId, active: true }))[0];
        if (!tab || tab.windowId !== windowId)
          throw new Error('This tab is no longer in the current window.');
        const metadata = await this.repository.get();
        const url = resourceKey(tab.pendingUrl || tab.url || '');
        await this.repository.authorResource(command.kind, {
          workspaceId: metadata.activeWorkspaceId,
          title: (tab.title || url).slice(0, 200),
          url,
          folderId: command.folderId ?? null,
          ...(tab.favIconUrl &&
          /^(https?:|data:image\/)/.test(tab.favIconUrl) &&
          tab.favIconUrl.length <= 16000
            ? { favicon: tab.favIconUrl }
            : {}),
        });
        break;
      }
      case 'resource.open': {
        const previous = this.queues.get(windowId) ?? Promise.resolve();
        const next = previous.then(
          () => this.open(command, windowId),
          () => this.open(command, windowId),
        );
        this.queues.set(windowId, next);
        try {
          await next;
        } finally {
          if (this.queues.get(windowId) === next) this.queues.delete(windowId);
        }
        break;
      }
    }
  }
  private async open(
    command: Extract<
      AuthorCommand,
      { type: 'resource.open' | 'resource.remove' }
    >,
    windowId: number,
  ) {
    const metadata = await this.repository.get();
    const entry = collection(metadata, command.kind).find(
      (e) => e.id === command.id,
    );
    if (!entry) throw new Error('Entry no longer exists.');
    const url = resourceKey(entry.url);
    const tabs = await chrome.tabs.query({ windowId });
    const existing = tabs.find((tab) => {
      try {
        return resourceKey(tab.pendingUrl || tab.url || '') === url;
      } catch {
        return false;
      }
    });
    if (existing?.id !== undefined)
      await chrome.tabs.update(existing.id, { active: true });
    else await chrome.tabs.create({ windowId, url });
  }
}
