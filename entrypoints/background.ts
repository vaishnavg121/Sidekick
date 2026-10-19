import { MetadataRepository } from '../lib/repository';
import {
  isCommand,
  PORT_NAME,
  type Request,
  type Reply,
  type ServerEvent,
} from '../lib/protocol';
import { toTabItem, type TabItem } from '../lib/tabs';
import { WindowStateRepository } from '../lib/window-state';
import { PanelService } from '../lib/panel-service';
import { ImmersiveController } from '../lib/immersive';
import { NavigationService, safeUrl } from '../lib/navigation';
import { readBookmarks } from '../lib/bookmarks';
import { isRestrictedUrl } from '../lib/tabs';
import { ResourceService } from '../lib/resource-service';

export default defineBackground(() => {
  const repository = new MetadataRepository(chrome.storage.local);
  const ready = chrome.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
  const clients = new Map<chrome.runtime.Port, number>();
  const windows = new WindowStateRepository(chrome.storage.session);
  const immersive = new ImmersiveController(chrome.windows, windows, () => {
    void refresh();
  });
  const navigation = new NavigationService();
  const resources = new ResourceService(repository);
  const panels = new PanelService(
    {
      open: (options) => chrome.sidePanel.open(options),
      close:
        typeof chrome.sidePanel.close === 'function'
          ? (options) => chrome.sidePanel.close(options)
          : undefined,
    },
    repository,
    windows,
    () => {
      void refresh();
    },
  );
  const report = (error: unknown) =>
    console.error('Sidekick panel state failed', error);
  const panelClients = new Map<
    chrome.runtime.Port,
    { windowId: number; documentId: string }
  >();
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
              const windowState = await windows.get(windowId);
              if (clients.has(port))
                send(port, {
                  type: 'snapshot',
                  tabs,
                  metadata,
                  windowId,
                  windowState,
                });
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
      const panel = panelClients.get(port);
      panelClients.delete(port);
      if (panel) {
        // Also supports Chrome 116–141, which has no onClosed event. A worker
        // disconnect alone is not proof of panel closure: inspect live contexts.
        void chrome.runtime
          .getContexts({
            contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
            documentIds: [panel.documentId],
          })
          .then((contexts) => {
            if (
              !contexts.length &&
              ![...panelClients.values()].some(
                (client) => client.windowId === panel.windowId,
              )
            )
              return panels.closed(panel.windowId);
          })
          .catch(report);
      }
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
      void immersive
        .synchronize(id)
        .then(() => refresh())
        .catch(report);
      const documentId = port.sender?.documentId;
      if (
        documentId &&
        port.sender?.url === chrome.runtime.getURL('sidepanel.html')
      ) {
        // A sidepanel.html preview opened as a normal tab is not an open panel.
        // Chrome reports -1 for native panel context windowId, so associate its
        // verified document with the window supplied by the panel itself.
        void chrome.runtime
          .getContexts({
            documentIds: [documentId],
            contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
          })
          .then((contexts) => {
            if (contexts.length && clients.has(port)) {
              panelClients.set(port, { windowId: id, documentId });
              return panels.connected(id, documentId);
            }
          })
          .catch(report);
      }
      // On older Chrome, a panel can close while the worker is asleep. Reconcile
      // its session handle on reconnect instead of relying on a missed event.
      void windows
        .get(id)
        .then(async (state) => {
          if (!state.nativePanelOpen || !state.nativeDocumentId) return;
          const active = await chrome.runtime.getContexts({
            documentIds: [state.nativeDocumentId],
            contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
          });
          if (
            !active.length &&
            ![...panelClients.values()].some((client) => client.windowId === id)
          )
            await panels.closed(id);
        })
        .catch(report);
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
      const command = request.command;
      const pinRequested =
        command.type === 'panel.pin' ||
        (command.type === 'preferences.update' &&
          command.patch.mode === 'pinned');
      if (pinRequested) {
        const windowId = sender.tab?.windowId ?? request.windowId;
        if (
          typeof windowId !== 'number' ||
          !Number.isInteger(windowId) ||
          windowId < 0
        ) {
          respond({ ok: false, error: 'Browser window is unavailable.' });
          return;
        }
        try {
          // Keep this call before ALL asynchronous work to retain the gesture.
          void panels
            .pin(windowId)
            .then(async () => {
              if (command.type === 'preferences.update') {
                const patch = { ...command.patch };
                delete patch.mode;
                if (Object.keys(patch).length)
                  await repository.updatePreferences(patch);
              }
              respond({ ok: true });
            })
            .catch(() =>
              respond({
                ok: false,
                error:
                  'Chrome could not finish pinning Sidekick. Click Pin or the toolbar icon to try again.',
              }),
            );
        } catch {
          respond({
            ok: false,
            error:
              'Chrome could not open the side panel. Use the Sidekick toolbar icon.',
          });
        }
        return true;
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
            case 'resource.save':
            case 'resource.current':
            case 'resource.open':
            case 'resource.remove':
            case 'resource.move':
            case 'resource.reorder':
            case 'workspace.save':
            case 'folder.save':
            case 'folder.remove':
              await resources.handle(c, windowId);
              break;
            case 'immersive.enter':
              await immersive.enter(windowId);
              break;
            case 'immersive.exit':
              await immersive.exit(windowId);
              break;
            case 'navigation.go':
              await navigation.navigate(windowId, c.input, c.newTab);
              break;
            case 'navigation.action':
              await navigation.action(windowId, c.action);
              break;
            case 'bookmarks.read':
              respond({ ok: true, bookmarks: await readBookmarks(c.query) });
              return;
            case 'favorite.save': {
              const metadata = await repository.get();
              const existing = metadata.favorites.find((f) => f.id === c.id);
              if (c.id && (!existing || existing.workspaceId !== c.workspaceId))
                throw new Error(
                  'Shortcut is no longer available in this workspace.',
                );
              await repository.authorResource('favorite', {
                ...(c.id ? { id: c.id } : {}),
                workspaceId: c.workspaceId,
                title: c.title.trim(),
                url: safeUrl(c.url.trim()),
              });
              break;
            }
            case 'favorite.remove':
              await repository.removeFavorite(c.id);
              break;
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
              if (c.patch.mode && c.patch.mode !== 'pinned')
                await panels.setMode(windowId, c.patch.mode);
              {
                const patch = { ...c.patch };
                delete patch.mode;
                if (Object.keys(patch).length)
                  await repository.updatePreferences(patch);
              }
              break;
            case 'sidebar.mode':
              await panels.setMode(windowId, c.mode);
              break;
            case 'search.update':
              await windows.update(windowId, { query: c.query });
              break;
            case 'panel.pin':
              break;
            case 'workspace.select':
              await repository.selectWorkspace(c.id);
              break;
          }
          respond({ ok: true });
          void refresh();
        } catch (error) {
          respond({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Action failed. The tab or window may be unavailable, or settings could not be saved.',
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
  chrome.sidePanel.onOpened?.addListener((info) => {
    void panels.opened(info.windowId).catch(report);
  });
  chrome.sidePanel.onClosed?.addListener((info) => {
    void panels.closed(info.windowId).catch(report);
  });
  chrome.windows.onRemoved.addListener((id) => {
    void windows.remove(id).catch(report);
  });
  chrome.windows.onBoundsChanged.addListener((window) => {
    if (window.id !== undefined)
      void immersive.synchronize(window.id).catch(report);
  });
  chrome.windows.onFocusChanged.addListener((id) => {
    if (id >= 0) void immersive.synchronize(id).catch(report);
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (tab?.windowId === undefined) return;
    if (command === 'exit-immersive') {
      void immersive.exit(tab.windowId).catch(report);
      return;
    }
    if (command !== 'focus-address' && command !== 'show-sidebar') return;
    const panelPorts = [...panelClients].filter(
      ([, info]) => info.windowId === tab.windowId,
    );
    if (panelPorts.length) {
      for (const [port] of panelPorts)
        send(port, { type: 'focus', address: command === 'focus-address' });
      return;
    }
    const dashboard = [...clients.keys()].find(
      (port) =>
        port.sender?.tab?.id === tab.id &&
        port.sender?.url === chrome.runtime.getURL('newtab.html'),
    );
    if (dashboard) {
      send(dashboard, { type: 'focus', address: command === 'focus-address' });
      return;
    }
    // Restricted pages cannot receive content scripts. Open Chrome's panel in
    // the command's gesture, before any awaits. It contains the same controls.
    if (isRestrictedUrl(tab.url ?? '')) {
      void panels.pin(tab.windowId).catch(report);
      return;
    }
    if (tab.id !== undefined)
      void chrome.tabs
        .sendMessage(tab.id, { channel: 'sidekick:page', action: command })
        .catch(report);
  });
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') changed();
  });
  const initialize = () => {
    void chrome.windows
      .getAll()
      .then((all) =>
        Promise.all(
          all
            .filter((w) => w.id !== undefined)
            .map((w) => immersive.synchronize(w.id!)),
        ),
      )
      .catch(report);
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
    void chrome.runtime
      .getContexts({
        contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
      })
      .then((contexts) =>
        Promise.all(
          contexts
            .filter((c) => c.windowId >= 0 && typeof c.documentId === 'string')
            .map((c) => panels.connected(c.windowId, c.documentId!)),
        ),
      )
      .catch(report);
  };
  chrome.runtime.onInstalled.addListener(initialize);
  chrome.runtime.onStartup.addListener(initialize);
  initialize();
});
