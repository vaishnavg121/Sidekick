import { MetadataRepository } from '../lib/repository';
import {
  isCommand,
  PORT_NAME,
  type Request,
  type Reply,
  type ServerEvent,
} from '../lib/protocol';
import { toTabItem, type TabItem } from '../lib/tabs';

export default defineBackground(() => {
  const repository = new MetadataRepository(chrome.storage.local);
  const ready = chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
  const clients = new Map<chrome.runtime.Port, number>();
  let refreshing = false;
  let dirty = false;
  const send = (port: chrome.runtime.Port, event: ServerEvent) => {
    try {
      port.postMessage(event);
    } catch {
      clients.delete(port);
    }
  };
  async function refresh() {
    dirty = true;
    if (refreshing) return;
    refreshing = true;
    try {
      while (dirty) {
        dirty = false;
        await ready;
        const metadata = await repository.get();
        await Promise.all(
          [...clients].map(async ([port, originalWindow]) => {
            try {
              const windowId =
                port.sender?.tab?.id !== undefined
                  ? (await chrome.tabs.get(port.sender.tab.id)).windowId
                  : originalWindow;
              clients.set(port, windowId);
              const tabs = (await chrome.tabs.query({ windowId }))
                .map(toTabItem)
                .filter((t): t is TabItem => !!t);
              if (clients.has(port))
                send(port, { type: 'snapshot', tabs, metadata, windowId });
            } catch {
              send(port, {
                type: 'error',
                error:
                  'This window is unavailable. Reopen Sidekick to reconnect.',
              });
            }
          }),
        );
      }
    } catch (error) {
      for (const port of clients.keys())
        send(port, {
          type: 'error',
          error:
            error instanceof Error ? error.message : 'Unable to load Sidekick.',
        });
    } finally {
      refreshing = false;
    }
  }
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME || port.sender?.id !== chrome.runtime.id)
      return;
    port.onDisconnect.addListener(() => {
      clients.delete(port);
    });
    port.onMessage.addListener((message: unknown) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        message.type !== 'subscribe'
      )
        return;
      const id =
        port.sender?.tab?.windowId ??
        ('windowId' in message ? message.windowId : undefined);
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) return;
      clients.set(port, id);
      void refresh();
    });
  });
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, respond: (reply: Reply) => void) => {
      if (
        sender.id !== chrome.runtime.id ||
        !message ||
        typeof message !== 'object' ||
        !('channel' in message) ||
        message.channel !== 'sidekick'
      )
        return;
      const request = message as Request;
      if (!isCommand(request.command)) {
        respond({ ok: false, error: 'Invalid Sidekick request.' });
        return;
      }
      void (async () => {
        try {
          await ready;
          const windowId =
            sender.tab?.id !== undefined
              ? (await chrome.tabs.get(sender.tab.id)).windowId
              : request.windowId;
          if (
            typeof windowId !== 'number' ||
            !Number.isInteger(windowId) ||
            windowId < 0
          )
            throw new Error('Browser window is unavailable.');
          const c = request.command;
          switch (c.type) {
            case 'tab.activate':
            case 'tab.close': {
              const tab = await chrome.tabs.get(c.tabId);
              if (tab.windowId !== windowId)
                throw new Error('Tab moved to another window.');
              if (c.type === 'tab.close') await chrome.tabs.remove(c.tabId);
              else await chrome.tabs.update(c.tabId, { active: true });
              break;
            }
            case 'tab.create':
              await chrome.tabs.create({ windowId });
              break;
            case 'preferences.update':
              await repository.updatePreferences(c.patch);
              break;
            case 'workspace.select':
              await repository.selectWorkspace(c.id);
              break;
          }
          respond({ ok: true });
          void refresh();
        } catch {
          respond({
            ok: false,
            error:
              'Action failed. The tab or window may be unavailable, or settings could not be saved.',
          });
        }
      })();
      return true;
    },
  );
  // Register synchronously so a suspended worker wakes for every relevant change.
  const changed = () => {
    if (clients.size) void refresh();
  };
  chrome.tabs.onCreated.addListener(changed);
  chrome.tabs.onRemoved.addListener(changed);
  chrome.tabs.onUpdated.addListener(changed);
  chrome.tabs.onActivated.addListener(changed);
  chrome.tabs.onMoved.addListener(changed);
  chrome.tabs.onAttached.addListener(changed);
  chrome.tabs.onDetached.addListener(changed);
  chrome.tabs.onReplaced.addListener(changed);
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') changed();
  });
  const initialize = () => {
    void ready
      .then(() => repository.get())
      .catch((error: unknown) =>
        console.error('Sidekick initialization failed', error),
      );
    void chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) =>
        console.error('Sidekick side panel unavailable', error),
      );
  };
  chrome.runtime.onInstalled.addListener(initialize);
  chrome.runtime.onStartup.addListener(initialize);
  initialize();
});
