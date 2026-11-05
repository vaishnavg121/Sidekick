import type { MetadataRepository, StorageArea } from './repository';
import type { WindowStateRepository } from './window-state';
import { toTabItem, type TabItem } from './tabs';
import { resourceKey } from './resources';

interface MembershipState {
  version: 2;
  tabs: Record<string, { windowId: number; workspaceId: string }>;
  lastActive: Record<string, number>;
}
interface RestoreHint {
  activeWorkspaceId: string;
  pages: { hash: string; workspaceId: string }[];
}
const hashes = new Map<string, Promise<string>>();
async function urlHash(url: string): Promise<string> {
  if (hashes.has(url)) return hashes.get(url)!;
  if (hashes.size > 1000) hashes.delete(hashes.keys().next().value!);
  const promise = computeHash(url);
  hashes.set(url, promise);
  return promise;
}
async function computeHash(url: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
const KEY = 'sidekick.memberships.v2';
const empty = (): MembershipState => ({ version: 2, tabs: {}, lastActive: {} });

/** Chrome handles are session-only. All membership operations share one queue. */
export class WorkspaceEngine {
  private hintsJson?: string;
  private recovering = true;
  private recoveryHints?: RestoreHint[];
  private pendingActivations = new Map<number, number>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private metadata: MetadataRepository,
    private area: StorageArea,
    private windows: WindowStateRepository,
    private api: Pick<
      typeof chrome.tabs,
      'query' | 'get' | 'update' | 'create' | 'move'
    > = chrome.tabs,
  ) {}
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async read(): Promise<MembershipState> {
    const value = (await this.area.get(KEY))[KEY] as
      MembershipState | undefined;
    return value?.version === 2 &&
      value.tabs &&
      typeof value.tabs === 'object' &&
      !Array.isArray(value.tabs) &&
      value.lastActive &&
      typeof value.lastActive === 'object' &&
      !Array.isArray(value.lastActive)
      ? value
      : empty();
  }
  private async activateTab(id: number) {
    const tab = await this.api.get(id);
    const expected = !tab.active;
    if (expected)
      this.pendingActivations.set(
        id,
        (this.pendingActivations.get(id) ?? 0) + 1,
      );
    try {
      await this.api.update(id, { active: true });
    } catch (error) {
      if (expected) {
        const n = this.pendingActivations.get(id) ?? 0;
        if (n <= 1) this.pendingActivations.delete(id);
        else this.pendingActivations.set(id, n - 1);
      }
      throw error;
    }
  }
  private async write(state: MembershipState) {
    await this.area.set({ [KEY]: state });
    await this.saveHints(state);
  }
  private async saveHints(state: MembershipState) {
    const live = await this.api.query({});
    const hints: RestoreHint[] = [];
    for (const windowId of new Set(live.map((t) => t.windowId))) {
      const activeWorkspaceId = await this.active(windowId);
      const pages = await Promise.all(
        live
          .filter(
            (t) =>
              t.windowId === windowId && t.id !== undefined && state.tabs[t.id],
          )
          .map(async (t) => ({
            hash: await urlHash(t.pendingUrl || t.url || ''),
            workspaceId: state.tabs[t.id!]!.workspaceId,
          })),
      );
      hints.push({ activeWorkspaceId, pages });
    }
    const previous = await this.metadata.getRestoreHints();
    const old = Array.isArray(previous) ? (previous as RestoreHint[]) : [];
    const combined = [
      ...hints,
      ...old.filter(
        (h) =>
          Array.isArray(h.pages) &&
          !hints.some((n) =>
            n.pages.some((p) => h.pages.some((o) => o.hash === p.hash)),
          ),
      ),
    ].slice(0, 20);
    const json = JSON.stringify(combined);
    if (json !== this.hintsJson) {
      this.hintsJson = json;
      await this.metadata.saveRestoreHints(combined);
    }
  }
  private async active(windowId: number): Promise<string> {
    const m = await this.metadata.get();
    const selected = await this.windows.getActiveWorkspaceId(windowId);
    if (selected && m.workspaces.some((w) => w.id === selected))
      return selected;
    await this.windows.setActiveWorkspaceId(windowId, m.activeWorkspaceId);
    return m.activeWorkspaceId;
  }
  activeWorkspace(windowId: number): Promise<string> {
    return this.serial(() => this.active(windowId));
  }
  private async reconcileState(): Promise<MembershipState> {
    const state = await this.read();
    if (this.recoveryHints === undefined) {
      const raw = await this.metadata.getRestoreHints();
      this.recoveryHints = Array.isArray(raw)
        ? raw.filter(
            (h) =>
              h &&
              Array.isArray(h.pages) &&
              typeof h.activeWorkspaceId === 'string',
          )
        : [];
      if (Object.keys(state.tabs).length) this.recovering = false;
    }
    const before = JSON.stringify(state);
    const m = await this.metadata.get();
    const allowed = new Set(m.workspaces.map((w) => w.id));
    const live = await this.api.query({});
    const ids = new Set(live.map((t) => String(t.id)));
    // Reload/browser restart clears session storage. Match URL hashes only when
    // a previous window is uniquely identifiable; ambiguous duplicates fall back.
    if (this.recovering && !Object.keys(state.tabs).length) {
      const raw = await this.metadata.getRestoreHints();
      const hints = Array.isArray(raw)
        ? raw.filter(
            (h): h is RestoreHint =>
              h &&
              Array.isArray(h.pages) &&
              typeof h.activeWorkspaceId === 'string',
          )
        : [];
      const used = new Set<RestoreHint>();
      for (const windowId of new Set(live.map((t) => t.windowId))) {
        const current = await Promise.all(
          live
            .filter((t) => t.windowId === windowId)
            .map(async (t) => ({
              tab: t,
              hash: await urlHash(t.pendingUrl || t.url || ''),
            })),
        );
        const ranked = hints
          .filter((h) => !used.has(h))
          .map((h) => ({
            h,
            score: current.filter((t) => h.pages.some((p) => p.hash === t.hash))
              .length,
          }))
          .sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (!best || best.score === 0 || ranked[1]?.score === best.score)
          continue;
        used.add(best.h);
        if (allowed.has(best.h.activeWorkspaceId))
          await this.windows.setActiveWorkspaceId(
            windowId,
            best.h.activeWorkspaceId,
          );
        for (const { tab, hash } of current) {
          const owners = new Set(
            best.h.pages
              .filter((p) => p.hash === hash && allowed.has(p.workspaceId))
              .map((p) => p.workspaceId),
          );
          if (tab.id !== undefined && owners.size === 1)
            state.tabs[tab.id] = { windowId, workspaceId: [...owners][0]! };
        }
      }
    }
    for (const id of Object.keys(state.tabs))
      if (!ids.has(id)) delete state.tabs[id];
    const savedHints = this.recovering ? this.recoveryHints : undefined;
    for (const t of live) {
      if (t.id === undefined) continue;
      let previous = state.tabs[t.id];
      if (
        this.recovering &&
        Array.isArray(savedHints) &&
        /^https?:/.test(t.pendingUrl || t.url || '')
      ) {
        const hash = await urlHash(t.pendingUrl || t.url || '');
        const owners = new Set(
          (savedHints as RestoreHint[]).flatMap((h) =>
            Array.isArray(h.pages)
              ? h.pages
                  .filter((p) => p.hash === hash && allowed.has(p.workspaceId))
                  .map((p) => p.workspaceId)
              : [],
          ),
        );
        if (owners.size === 1)
          previous = { windowId: t.windowId, workspaceId: [...owners][0]! };
      }
      state.tabs[t.id] = {
        windowId: t.windowId,
        workspaceId:
          previous && allowed.has(previous.workspaceId)
            ? previous.workspaceId
            : await this.active(t.windowId),
      };
    }
    for (const [key, id] of Object.entries(state.lastActive)) {
      const owner = state.tabs[id];
      if (!owner || `${owner.windowId}:${owner.workspaceId}` !== key)
        delete state.lastActive[key];
    }
    if (JSON.stringify(state) !== before) await this.write(state);
    await this.saveHints(state);
    return state;
  }
  reconcile(): Promise<void> {
    return this.serial(async () => {
      await this.reconcileState();
    });
  }
  deleteWorkspace(id: string): Promise<void> {
    return this.serial(async () => {
      this.recovering = false;
      const state = await this.reconcileState();
      if (Object.values(state.tabs).some((t) => t.workspaceId === id))
        throw Error(
          'Move this workspace’s live tabs before deleting it. No tabs were closed.',
        );
      await this.metadata.deleteWorkspace(id);
      for (const windowId of new Set(
        Object.values(state.tabs).map((t) => t.windowId),
      ))
        await this.active(windowId);
      await this.reconcileState();
    });
  }
  snapshot(
    windowId: number,
  ): Promise<{ workspaceId: string; tabs: TabItem[] }> {
    return this.serial(async () => {
      const state = await this.reconcileState();
      const workspaceId = await this.active(windowId);
      const tabs = (await this.api.query({ windowId }))
        .map(toTabItem)
        .filter(
          (t): t is TabItem =>
            !!t && state.tabs[t.id]?.workspaceId === workspaceId,
        );
      return { workspaceId, tabs };
    });
  }
  select(windowId: number, workspaceId: string): Promise<void> {
    return this.serial(async () => {
      this.recovering = false;
      const m = await this.metadata.get();
      if (!m.workspaces.some((w) => w.id === workspaceId))
        throw Error('Workspace no longer exists.');
      const state = await this.reconcileState();
      await this.windows.setActiveWorkspaceId(windowId, workspaceId);
      const candidates = (await this.api.query({ windowId })).filter(
        (t) =>
          t.id !== undefined && state.tabs[t.id]?.workspaceId === workspaceId,
      );
      const last = state.lastActive[`${windowId}:${workspaceId}`];
      const target =
        candidates.find((t) => t.id === last) ??
        candidates.find((t) => t.active) ??
        candidates[0];
      if (target?.id !== undefined) await this.activateTab(target.id);
      await this.saveHints(state);
    });
  }
  activated(tabId: number, windowId: number): Promise<void> {
    return this.serial(async () => {
      const state = await this.reconcileState();
      const expected = this.pendingActivations.get(tabId) ?? 0;
      if (expected) {
        if (expected === 1) this.pendingActivations.delete(tabId);
        else this.pendingActivations.set(tabId, expected - 1);
        return;
      }
      const current = await this.api.get(tabId).catch(() => undefined);
      if (!current?.active) return;
      const owner = state.tabs[tabId];
      if (!owner || owner.windowId !== windowId) return;
      await this.windows.setActiveWorkspaceId(windowId, owner.workspaceId);
      state.lastActive[`${windowId}:${owner.workspaceId}`] = tabId;
      await this.write(state);
    });
  }
  replaced(added: number, removed: number): Promise<void> {
    return this.serial(async () => {
      const state = await this.read();
      if (state.tabs[removed]) state.tabs[added] = state.tabs[removed]!;
      delete state.tabs[removed];
      for (const key of Object.keys(state.lastActive))
        if (state.lastActive[key] === removed) state.lastActive[key] = added;
      await this.write(state);
      await this.reconcileState();
    });
  }
  move(tabId: number, windowId: number, workspaceId: string): Promise<void> {
    return this.serial(async () => {
      this.recovering = false;
      const m = await this.metadata.get();
      if (!m.workspaces.some((w) => w.id === workspaceId))
        throw Error('Workspace no longer exists.');
      const tab = await this.api.get(tabId);
      if (tab.windowId !== windowId)
        throw Error('Tab moved to another window.');
      const state = await this.reconcileState();
      const source = await this.active(windowId);
      if (state.tabs[tabId]?.workspaceId !== source)
        throw Error('Tab is not in the selected workspace.');
      state.tabs[tabId] = { windowId, workspaceId };
      await this.write(state);
      // Moving a visible active tab leaves the source workspace selected.
      if (tab.active) {
        const next = (await this.api.query({ windowId })).find(
          (t) =>
            t.id !== tabId &&
            t.id !== undefined &&
            state.tabs[t.id]?.workspaceId === source,
        );
        if (next?.id !== undefined) await this.activateTab(next.id);
      }
    });
  }
  create(
    windowId: number,
    url?: string,
    workspaceId?: string,
  ): Promise<chrome.tabs.Tab> {
    return this.serial(async () => {
      this.recovering = false;
      const selected = workspaceId ?? (await this.active(windowId));
      const m = await this.metadata.get();
      if (!m.workspaces.some((w) => w.id === selected))
        throw Error('Workspace no longer exists.');
      const state = await this.reconcileState();
      await this.windows.setActiveWorkspaceId(windowId, selected);
      const tab = await this.api.create({ windowId, ...(url ? { url } : {}) });
      if (tab.id !== undefined) {
        if (tab.active)
          this.pendingActivations.set(
            tab.id,
            (this.pendingActivations.get(tab.id) ?? 0) + 1,
          );
        state.tabs[tab.id] = { windowId, workspaceId: selected };
        state.lastActive[`${windowId}:${selected}`] = tab.id;
        await this.write(state);
      }
      return tab;
    });
  }
  open(windowId: number, url: string, workspaceId?: string): Promise<void> {
    return this.serial(async () => {
      this.recovering = false;
      const selected = workspaceId ?? (await this.active(windowId));
      const m = await this.metadata.get();
      if (!m.workspaces.some((w) => w.id === selected))
        throw Error('Workspace no longer exists.');
      const key = resourceKey(url);
      const state = await this.reconcileState();
      const existing = (await this.api.query({ windowId })).find((t) => {
        try {
          return resourceKey(t.pendingUrl || t.url || '') === key;
        } catch {
          return false;
        }
      });
      await this.windows.setActiveWorkspaceId(windowId, selected);
      if (existing?.id !== undefined) {
        // Opening a durable shortcut explicitly adopts a matching live tab.
        state.tabs[existing.id] = { windowId, workspaceId: selected };
        state.lastActive[`${windowId}:${selected}`] = existing.id;
        await this.write(state);
        await this.activateTab(existing.id);
      } else {
        const tab = await this.api.create({ windowId, url: key });
        if (tab.id !== undefined) {
          if (tab.active)
            this.pendingActivations.set(
              tab.id,
              (this.pendingActivations.get(tab.id) ?? 0) + 1,
            );
          state.tabs[tab.id] = { windowId, workspaceId: selected };
          await this.write(state);
        }
      }
    });
  }
  reorder(tabId: number, windowId: number, index: number): Promise<void> {
    return this.serial(async () => {
      this.recovering = false;
      const state = await this.reconcileState();
      const selected = await this.active(windowId);
      const all = await this.api.query({ windowId });
      const tab = all.find((t) => t.id === tabId);
      const target = all.find((t) => t.index === index);
      if (
        !tab ||
        state.tabs[tabId]?.workspaceId !== selected ||
        !target ||
        state.tabs[target.id!]?.workspaceId !== selected
      )
        throw Error('Tab reorder destination is no longer available.');
      if (tab.pinned !== target.pinned || tab.groupId !== target.groupId)
        throw Error(
          'Move within the same native pinned region and Chrome tab group.',
        );
      await this.api.move(tabId, { index: target.index });
    });
  }
}
