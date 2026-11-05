import {
  ProductivityService,
  isProductivityCommand,
} from '../lib/productivity';
import { MetadataRepository } from '../lib/repository';
import {
  isCommand,
  PORT_NAME,
  type Request,
  type Reply,
  type ServerEvent,
} from '../lib/protocol';
import { WindowStateRepository } from '../lib/window-state';
import { PanelService } from '../lib/panel-service';
import { ImmersiveController } from '../lib/immersive';
import {
  NavigationService,
  safeUrl,
  resolveAddress as safeUrlForNavigation,
} from '../lib/navigation';
import { readBookmarks } from '../lib/bookmarks';
import { isRestrictedUrl } from '../lib/tabs';
import { ResourceService } from '../lib/resource-service';
import { aiService } from '../lib/ai-service';
import { WorkspaceEngine } from '../lib/workspaces';
import type { AiSettings } from '../lib/models';

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
  const workspaceEngine = new WorkspaceEngine(
    repository,
    chrome.storage.session,
    windows,
  );
  const resources = new ResourceService(repository, workspaceEngine);
  const productivity = new ProductivityService(repository, workspaceEngine);
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
  // AI settings storage key
  const AI_SETTINGS_KEY = 'sidekick.ai.v1';
  async function getAiSettings(): Promise<AiSettings> {
    const value = (await chrome.storage.local.get(AI_SETTINGS_KEY))[
      AI_SETTINGS_KEY
    ];
    if (
      value &&
      typeof value === 'object' &&
      'connected' in value &&
      'status' in value
    ) {
      return value as AiSettings;
    }
    return { connected: false, status: 'disconnected' };
  }
  async function setAiSettings(
    patch: Partial<AiSettings>,
  ): Promise<AiSettings> {
    const current = await getAiSettings();
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ [AI_SETTINGS_KEY]: next });
    return next;
  }
  async function verifyAiKey(
    key: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return aiService.verifyConnection(key);
  }
  async function refresh() {
    dirty = true;
    if (refreshing) return;
    refreshing = true;
    try {
      while (dirty) {
        dirty = false;
        await ready;
        const storedMetadata = await repository.get();
        const { aiSettings: _legacySettings, ...metadata } = storedMetadata;
        void _legacySettings;
        const snapshots = new Map<
          number,
          Promise<Awaited<ReturnType<typeof workspaceEngine.snapshot>>>
        >();
        const aiSettings = await getAiSettings();
        await Promise.all(
          [...clients].map(async ([port, originalWindow]) => {
            try {
              const windowId =
                port.sender?.tab?.id !== undefined
                  ? (await chrome.tabs.get(port.sender.tab.id)).windowId
                  : originalWindow;
              clients.set(port, windowId);
              let snapshot = snapshots.get(windowId);
              if (!snapshot) {
                snapshot = workspaceEngine.snapshot(windowId);
                snapshots.set(windowId, snapshot);
              }
              const { tabs, workspaceId } = await snapshot;
              const windowState = await windows.get(windowId);
              if (clients.has(port))
                send(port, {
                  type: 'snapshot',
                  tabs,
                  metadata: {
                    ...metadata,
                    activeWorkspaceId: workspaceId,
                    aiSettings: {
                      connected: aiSettings.connected,
                      status: aiSettings.status,
                      lastError: aiSettings.lastError,
                      lastVerified: aiSettings.lastVerified,
                    },
                  },
                  windowId,
                  windowState: {
                    ...windowState,
                    groups: (await chrome.tabGroups.query({ windowId })).map(
                      (g) => ({ id: g.id, title: g.title || 'Tab group' }),
                    ),
                  },
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
          if (isProductivityCommand(c as unknown as Record<string, unknown>)) {
            const result = await productivity.handle(
              c as import('../lib/productivity').ProductivityCommand,
              windowId,
            );
            respond({ ok: true, ...result });
            void refresh();
            return;
          }
          switch (c.type) {
            case 'dashboard.open':
              await chrome.tabs.create({
                windowId,
                url: chrome.runtime.getURL('dashboard.html'),
              });
              break;
            case 'settings.open':
              await chrome.runtime.openOptionsPage();
              break;
            case 'shortcuts.read':
              respond({ ok: true, shortcuts: await chrome.commands.getAll() });
              return;
            case 'resource.save':
            case 'resource.current':
            case 'resource.open':
            case 'resource.remove':
            case 'resource.move':
            case 'resource.reorder':
            case 'workspace.save':
            case 'folder.save':
            case 'folder.remove':
            case 'folder.reorder':
            case 'folder.move':
              await resources.handle(c, windowId);
              if (c.type === 'workspace.save') {
                const updated = await repository.get();
                await workspaceEngine.select(
                  windowId,
                  c.input.id ??
                    updated.workspaces[updated.workspaces.length - 1]!.id,
                );
              }
              break;
            case 'immersive.enter':
              await immersive.enter(windowId);
              break;
            case 'immersive.exit':
              await immersive.exit(windowId);
              break;
            case 'navigation.go': {
              const snapshot = await workspaceEngine.snapshot(windowId);
              if (c.newTab || !snapshot.tabs.some((t) => t.active))
                await workspaceEngine.create(
                  windowId,
                  safeUrlForNavigation(c.input),
                );
              else await navigation.navigate(windowId, c.input, false);
              break;
            }
            case 'navigation.action': {
              if (
                !(await workspaceEngine.snapshot(windowId)).tabs.some(
                  (t) => t.active,
                )
              )
                throw Error('No active tab in this workspace.');
              await navigation.action(windowId, c.action);
              break;
            }
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
              await workspaceEngine.create(windowId);
              break;
            case 'tab.move': {
              if (c.windowId !== windowId)
                throw Error('Tab moved to another window.');
              await workspaceEngine.reorder(c.tabId, windowId, c.index);
              break;
            }
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
            case 'workspace.delete':
              await workspaceEngine.deleteWorkspace(c.id);
              break;
            case 'workspace.select':
              await workspaceEngine.select(windowId, c.id);
              break;
            case 'ai.settings.update': {
              if (
                !sender.url?.startsWith(chrome.runtime.getURL('')) ||
                !['options.html', 'sidepanel.html', 'dashboard.html'].some(
                  (path) => sender.url === chrome.runtime.getURL(path),
                )
              )
                throw Error(
                  'Open trusted Sidekick settings to configure the Gateway key.',
                );
              const key = c.patch.gatewayKey?.trim() ?? '';
              if (!key) {
                await setAiSettings({
                  gatewayKey: undefined,
                  connected: false,
                  status: 'disconnected',
                  lastError: undefined,
                });
                aiService.setGatewayKey(undefined);
              } else {
                const result = await verifyAiKey(key);
                if (!result.ok) {
                  await setAiSettings({
                    gatewayKey: undefined,
                    connected: false,
                    status: 'error',
                    lastError: result.error,
                  });
                  aiService.setGatewayKey(undefined);
                  throw Error(result.error ?? 'Gateway verification failed.');
                }
                await setAiSettings({
                  gatewayKey: key,
                  connected: true,
                  status: 'connected',
                  lastError: undefined,
                  lastVerified: new Date().toISOString(),
                });
                aiService.setGatewayKey(key);
              }
              break;
            }
            case 'ai.classify':
            case 'ai.route':
            case 'ai.group':
            case 'ai.focus':
            case 'ai.cleanup': {
              const settings = await getAiSettings();
              aiService.setGatewayKey(settings.gatewayKey);
              const { tabs, workspaceId } =
                await workspaceEngine.snapshot(windowId);
              if (c.tabIds.some((id) => !tabs.some((t) => t.id === id)))
                throw Error('Selected tabs are no longer in this workspace.');
              const target = tabs.filter((t) => c.tabIds.includes(t.id));
              const m = await repository.get();
              let event: ServerEvent;
              if (c.type === 'ai.classify') {
                const accepted: Record<
                  number,
                  import('../lib/models').TabClassification
                > = {};
                for (const tab of target) {
                  const saved = m.aiState?.acceptedByUrl?.[tab.url];
                  if (saved) accepted[tab.id] = { ...saved, tabId: tab.id };
                }
                event = {
                  type: 'ai.classify.result',
                  classifications: await aiService.classifyTabs(
                    target,
                    undefined,
                    accepted,
                  ),
                };
              } else if (c.type === 'ai.route') {
                const recommendations = await aiService.routeTabs(
                  target,
                  m.workspaces,
                );
                event = {
                  type: 'ai.route.result',
                  recommendations: recommendations.filter(
                    (r) =>
                      !m.aiState?.rejectedByUrl?.[
                        target.find((t) => t.id === r.tabId)!.url
                      ]?.includes(r.workspaceId),
                  ),
                };
              } else if (c.type === 'ai.group')
                event = {
                  type: 'ai.group.result',
                  groups: await aiService.groupTabs(target),
                };
              else if (c.type === 'ai.cleanup')
                event = {
                  type: 'ai.cleanup.result',
                  suggestions: await aiService.suggestCleanup(target),
                };
              else {
                const relevance = await aiService.scoreFocus(target, c.goal);
                const hiddenIds = relevance
                  .filter((r) => r.score < 0.5)
                  .map((r) => r.tabId);
                const windowState = await windows.get(windowId);
                await windows.update(windowId, {
                  focusHidden: {
                    ...windowState.focusHidden,
                    [workspaceId]: hiddenIds,
                  },
                });
                const hiddenUrls = target
                  .filter((t) =>
                    relevance.some((r) => r.tabId === t.id && r.score < 0.5),
                  )
                  .filter((t) =>
                    target
                      .filter((other) => other.url === t.url)
                      .every((other) => hiddenIds.includes(other.id)),
                  )
                  .map((t) => t.url);
                await repository.updateAiState((ai) => ({
                  ...ai,
                  focusPreferences: {
                    ...ai.focusPreferences,
                    [workspaceId]: {
                      goal: c.goal,
                      mode: true,
                      hiddenTabIds: [],
                      hiddenUrls,
                      lastUpdated: new Date().toISOString(),
                    },
                  },
                }));
                event = { type: 'ai.focus.result', relevance };
              }
              if (
                (await workspaceEngine.activeWorkspace(windowId)) ===
                workspaceId
              )
                for (const [port, id] of clients)
                  if (id === windowId) send(port, event);
              break;
            }
            case 'focus.update': {
              const workspaceId =
                await workspaceEngine.activeWorkspace(windowId);
              let durableUrls = c.hiddenUrls;
              if (c.hiddenTabIds !== undefined) {
                const snapshot = await workspaceEngine.snapshot(windowId);
                if (
                  c.hiddenTabIds.some(
                    (id) => !snapshot.tabs.some((t) => t.id === id),
                  )
                )
                  throw Error('Focus tab no longer exists in this workspace.');
                durableUrls = snapshot.tabs
                  .filter(
                    (t) =>
                      c.hiddenTabIds!.includes(t.id) &&
                      snapshot.tabs
                        .filter((other) => other.url === t.url)
                        .every((other) => c.hiddenTabIds!.includes(other.id)),
                  )
                  .map((t) => t.url);
                const state = await windows.get(windowId);
                await windows.update(windowId, {
                  focusHidden: {
                    ...state.focusHidden,
                    [workspaceId]: c.hiddenTabIds,
                  },
                });
              }
              await repository.updateAiState((ai) => ({
                ...ai,
                focusPreferences: {
                  ...ai.focusPreferences,
                  [workspaceId]: {
                    goal: c.goal,
                    mode: c.mode,
                    hiddenTabIds: [],
                    hiddenUrls:
                      durableUrls ??
                      ai.focusPreferences[workspaceId]?.hiddenUrls ??
                      [],
                    lastUpdated: new Date().toISOString(),
                  },
                },
              }));
              break;
            }
            case 'ai.route.reject': {
              const { tabs } = await workspaceEngine.snapshot(windowId);
              const tab = tabs.find((t) => t.id === c.tabId);
              if (!tab) throw Error('Tab no longer exists in this workspace.');
              await repository.updateAiState((ai) => ({
                ...ai,
                rejectedByUrl: {
                  ...ai.rejectedByUrl,
                  [tab.url]: [
                    ...new Set([
                      ...(ai.rejectedByUrl?.[tab.url] ?? []),
                      c.workspaceId,
                    ]),
                  ],
                },
              }));
              break;
            }
            case 'ai.apply.classification': {
              const { tabs } = await workspaceEngine.snapshot(windowId);
              if (
                c.classifications.some(
                  (cls) => !tabs.some((t) => t.id === cls.tabId),
                )
              )
                throw Error('Tab no longer exists in this workspace.');
              await repository.updateAiState((ai) => {
                const accepted = { ...ai.acceptedByUrl };
                for (const cls of c.classifications) {
                  const tab = tabs.find((t) => t.id === cls.tabId)!;
                  accepted[tab.url] = {
                    category: cls.category,
                    confidence: cls.confidence,
                    reasoning: cls.reasoning,
                  };
                }
                return { ...ai, acceptedByUrl: accepted };
              });
              break;
            }
            case 'ai.apply.routing': {
              // Validate the entire batch before the first membership change.
              const { tabs } = await workspaceEngine.snapshot(windowId);
              const m = await repository.get();
              if (
                c.recommendations.some(
                  (r) =>
                    !tabs.some((t) => t.id === r.tabId) ||
                    !m.workspaces.some((w) => w.id === r.workspaceId),
                )
              )
                throw Error('Routing destination or tab no longer exists.');
              for (const r of c.recommendations)
                await workspaceEngine.move(r.tabId, windowId, r.workspaceId);
              break;
            }
            case 'ai.apply.groups': {
              const { tabs } = await workspaceEngine.snapshot(windowId);
              if (
                c.groups.some((g) =>
                  g.tabs.some((id) => !tabs.some((t) => t.id === id)),
                )
              )
                throw Error('Group contains tabs outside this workspace.');
              for (const group of c.groups) {
                const groupId = await chrome.tabs.group({
                  tabIds: group.tabs as [number, ...number[]],
                });
                await chrome.tabGroups.update(groupId, { title: group.topic });
              }
              break;
            }
            case 'ai.apply.focus': {
              const { tabs, workspaceId } =
                await workspaceEngine.snapshot(windowId);
              if (c.relevance.some((r) => !tabs.some((t) => t.id === r.tabId)))
                throw Error('Focus tab no longer exists.');
              await repository.updateAiState((ai) => {
                const previous = ai.focusPreferences[workspaceId];
                return {
                  ...ai,
                  focusPreferences: {
                    ...ai.focusPreferences,
                    [workspaceId]: {
                      goal: previous?.goal ?? '',
                      mode: true,
                      hiddenTabIds: [],
                      hiddenUrls: tabs
                        .filter((t) =>
                          c.relevance.some(
                            (r) => r.tabId === t.id && r.score < 0.5,
                          ),
                        )
                        .map((t) => t.url),
                      lastUpdated: new Date().toISOString(),
                    },
                  },
                };
              });
              break;
            }
            case 'ai.apply.cleanup': {
              const { tabs } = await workspaceEngine.snapshot(windowId);
              const ids = [...new Set(c.suggestions.flatMap((s) => s.tabIds))];
              if (ids.some((id) => !tabs.some((t) => t.id === id)))
                throw Error('Cleanup tabs changed. Review suggestions again.');
              for (const id of ids)
                await productivity.handle(
                  { type: 'archive.tab', tabId: id, close: true },
                  windowId,
                );
              break;
            }
            case 'tab.updateWorkspace': {
              await workspaceEngine.move(c.tabId, windowId, c.workspaceId);
              break;
            }
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
  chrome.alarms.onAlarm.addListener((alarm) => {
    void productivity.due(alarm.name).then(changed).catch(report);
  });
  chrome.tabs.onCreated.addListener(() => {
    void workspaceEngine.reconcile().then(changed).catch(report);
  });
  chrome.tabs.onRemoved.addListener(() => {
    void workspaceEngine.reconcile().then(changed).catch(report);
  });
  chrome.tabs.onUpdated.addListener(changed);
  chrome.tabs.onActivated.addListener((info) => {
    void workspaceEngine
      .activated(info.tabId, info.windowId)
      .then(changed)
      .catch(report);
  });
  chrome.tabs.onMoved.addListener(changed);
  chrome.tabs.onAttached.addListener(() => {
    void workspaceEngine.reconcile().then(changed).catch(report);
  });
  chrome.tabs.onDetached.addListener(changed);
  chrome.tabs.onReplaced.addListener((added, removed) => {
    void workspaceEngine.replaced(added, removed).then(changed).catch(report);
  });
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
    if (
      [
        'next-workspace',
        'previous-workspace',
        'new-tab',
        'toggle-focus',
        'toggle-sidebar',
      ].includes(command)
    ) {
      void (async () => {
        const windowId = tab.windowId;
        const m = await repository.get(),
          selected = await workspaceEngine.activeWorkspace(windowId);
        if (command === 'next-workspace' || command === 'previous-workspace') {
          const index = m.workspaces.findIndex((w) => w.id === selected),
            delta = command === 'next-workspace' ? 1 : -1;
          await workspaceEngine.select(
            windowId,
            m.workspaces[
              (index + delta + m.workspaces.length) % m.workspaces.length
            ]!.id,
          );
        } else if (command === 'new-tab')
          await workspaceEngine.create(windowId);
        else if (command === 'toggle-sidebar')
          await panels.setMode(
            windowId,
            m.preferences.mode === 'hidden' ? 'hover' : 'hidden',
          );
        else
          await repository.updateAiState((ai) => {
            const p = ai.focusPreferences[selected] ?? {
              goal: '',
              mode: false,
              hiddenTabIds: [],
              hiddenUrls: [],
              lastUpdated: new Date().toISOString(),
            };
            return {
              ...ai,
              focusPreferences: {
                ...ai.focusPreferences,
                [selected]: { ...p, mode: !p.mode },
              },
            };
          });
        await refresh();
      })().catch(report);
      return;
    }
    if (command === 'focus-tab-search' || command === 'organize-jev') {
      const event: ServerEvent = {
        type: 'focus',
        address: false,
        uiAction: command,
      };
      const ports = [...clients].filter(
        ([port, id]) =>
          id === tab.windowId &&
          (panelClients.has(port) || port.sender?.tab?.id === tab.id),
      );
      if (ports.length) {
        for (const [port] of ports) send(port, event);
        return;
      }
      if (isRestrictedUrl(tab.url ?? '')) {
        void panels.pin(tab.windowId).catch(report);
        return;
      }
      if (tab.id !== undefined)
        void chrome.tabs
          .sendMessage(tab.id, { channel: 'sidekick:page', action: command })
          .catch(report);
      return;
    }
    if (command === 'exit-immersive') {
      void immersive.exit(tab.windowId).catch(report);
      return;
    }
    if (command === 'open-command-palette') {
      // Send focus event to open command palette
      const panelPorts = [...panelClients].filter(
        ([, info]) => info.windowId === tab.windowId,
      );
      if (panelPorts.length) {
        for (const [port] of panelPorts)
          send(port, {
            type: 'focus',
            address: false,
            openCommandPalette: true,
          });
        return;
      }
      const dashboard = [...clients.keys()].find(
        (port) =>
          port.sender?.tab?.id === tab.id &&
          port.sender?.url === chrome.runtime.getURL('dashboard.html'),
      );
      if (dashboard) {
        send(dashboard, {
          type: 'focus',
          address: false,
          openCommandPalette: true,
        });
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
        port.sender?.url === chrome.runtime.getURL('dashboard.html'),
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
      .then(async () => {
        const legacy = (await repository.get()).aiSettings;
        if (legacy?.gatewayKey && !(await getAiSettings()).gatewayKey)
          await setAiSettings(legacy);

        await workspaceEngine.reconcile();
        await productivity.reconcileAlarms();
      })
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
