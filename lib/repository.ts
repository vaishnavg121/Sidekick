import {
  createMetadata,
  normalizePreferences,
  validateFolders,
  type Metadata,
  type SidebarPreferences,
  type WorkspaceSession,
  type Workspace,
  type WorkspaceFavorite,
  type PinnedEntry,
  type Folder,
  type ResourceKind,
} from './models';
import {
  saveResource,
  reorderResources,
  type ResourceInput,
} from './resources';

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
export const METADATA_KEY = 'sidekick.metadata.v1';
export function isMetadata(value: unknown): value is Metadata {
  if (!value || typeof value !== 'object') return false;
  const m = value as Metadata;
  if (
    m.version !== 1 ||
    (m.layoutVersion !== undefined && m.layoutVersion !== 2) ||
    !Array.isArray(m.workspaces) ||
    !m.workspaces.length ||
    !m.preferences ||
    typeof m.preferences !== 'object'
  )
    return false;
  if (
    !m.workspaces.every(
      (w) =>
        w &&
        typeof w.id === 'string' &&
        typeof w.name === 'string' &&
        typeof w.color === 'string' &&
        typeof w.createdAt === 'string' &&
        (w.icon === undefined ||
          (typeof w.icon === 'string' && w.icon.length <= 12)) &&
        (w.theme === undefined ||
          ['dark', 'light', 'system'].includes(w.theme)) &&
        (w.preferredEmail === undefined ||
          typeof w.preferredEmail === 'string'),
    )
  )
    return false;
  const ids = new Set(m.workspaces.map((w) => w.id));
  if (ids.size !== m.workspaces.length || !ids.has(m.activeWorkspaceId))
    return false;
  if (![m.favorites, m.pinnedEntries, m.folders].every(Array.isArray))
    return false;
  const entries = [...m.favorites, ...m.pinnedEntries];
  if (
    !entries.every(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        ids.has(e.workspaceId) &&
        typeof e.title === 'string' &&
        typeof e.url === 'string' &&
        Number.isFinite(e.order) &&
        (e.favicon === undefined || typeof e.favicon === 'string'),
    )
  )
    return false;
  if (
    new Set(m.favorites.map((e) => e.id)).size !== m.favorites.length ||
    new Set(m.pinnedEntries.map((e) => e.id)).size !== m.pinnedEntries.length
  )
    return false;
  if (
    !m.folders.every(
      (f) =>
        f &&
        typeof f.id === 'string' &&
        typeof f.name === 'string' &&
        typeof f.workspaceId === 'string' &&
        (f.parentId === null || typeof f.parentId === 'string') &&
        Number.isFinite(f.order) &&
        (f.collapsed === undefined || typeof f.collapsed === 'boolean'),
    )
  )
    return false;
  if (!validateFolders(m.folders, ids)) return false;
  return m.pinnedEntries.every(
    (e) =>
      e.folderId === null ||
      m.folders.some(
        (f) => f.id === e.folderId && f.workspaceId === e.workspaceId,
      ),
  );
}
export class MetadataRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private area: StorageArea) {}
  // Serialize read-modify-write operations in the single background owner.
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async read(): Promise<Metadata> {
    const value = (await this.area.get(METADATA_KEY))[METADATA_KEY];
    if (value === undefined) {
      const initial = createMetadata();
      await this.area.set({ [METADATA_KEY]: initial });
      return initial;
    }
    if (!isMetadata(value))
      throw new Error(
        'Workspace data could not be read. Existing data was preserved.',
      );
    if (value.layoutVersion === undefined) {
      const migrated: Metadata = {
        ...value,
        layoutVersion: 2,
        preferences: normalizePreferences({
          ...value.preferences,
          mode:
            value.preferences.mode === 'pinned'
              ? 'docked'
              : value.preferences.mode,
        }),
      };
      await this.area.set({ [METADATA_KEY]: migrated });
      return migrated;
    }
    return { ...value, preferences: normalizePreferences(value.preferences) };
  }
  get(): Promise<Metadata> {
    return this.serial(() => this.read());
  }
  updatePreferences(patch: Partial<SidebarPreferences>): Promise<Metadata> {
    return this.update((m) => ({
      ...m,
      preferences: normalizePreferences({ ...m.preferences, ...patch }),
    }));
  }
  selectWorkspace(id: string): Promise<Metadata> {
    return this.update((m) => {
      if (!m.workspaces.some((w) => w.id === id))
        throw new Error('Workspace no longer exists.');
      return { ...m, activeWorkspaceId: id };
    });
  }
  // Metadata authoring APIs for later milestones; deliberately not exposed by
  // milestone 1 messaging or UI. Validation checks all references atomically.
  saveWorkspace(workspace: Workspace): Promise<Metadata> {
    return this.update((m) => ({
      ...m,
      workspaces: upsert(m.workspaces, workspace),
    }));
  }
  saveFavorite(favorite: WorkspaceFavorite): Promise<Metadata> {
    return this.update((m) => ({
      ...m,
      favorites: upsert(m.favorites, favorite),
    }));
  }
  removeFavorite(id: string): Promise<Metadata> {
    return this.update((m) => ({
      ...m,
      favorites: m.favorites.filter((f) => f.id !== id),
    }));
  }
  authorResource(kind: ResourceKind, input: ResourceInput): Promise<Metadata> {
    return this.update((m) => saveResource(m, kind, input));
  }
  removeResource(kind: ResourceKind, id: string): Promise<Metadata> {
    return this.update((m) => ({
      ...m,
      [kind === 'favorite' ? 'favorites' : 'pinnedEntries']: (kind ===
      'favorite'
        ? m.favorites
        : m.pinnedEntries
      ).filter((e) => e.id !== id),
    }));
  }
  moveResource(
    kind: ResourceKind,
    id: string,
    workspaceId: string,
    folderId: string | null,
  ): Promise<Metadata> {
    return this.update((m) => {
      const entry = (kind === 'favorite' ? m.favorites : m.pinnedEntries).find(
        (e) => e.id === id,
      );
      if (!entry) throw new Error('Entry no longer exists.');
      return saveResource(m, kind, { ...entry, workspaceId, folderId });
    });
  }
  reorder(
    kind: ResourceKind,
    workspaceId: string,
    ids: string[],
    folderId: string | null,
  ): Promise<Metadata> {
    return this.update((m) =>
      reorderResources(m, kind, workspaceId, ids, folderId),
    );
  }
  authorWorkspace(input: {
    id?: string;
    name: string;
    color: string;
    icon: string;
    theme: 'dark' | 'light' | 'system';
    preferredEmail: string;
  }): Promise<Metadata> {
    return this.update((m) => {
      const existing = m.workspaces.find((w) => w.id === input.id);
      if (input.id && !existing) throw new Error('Workspace no longer exists.');
      const name = input.name.trim();
      if (!name || name.length > 60 || !/^#[\da-f]{6}$/i.test(input.color))
        throw new Error('Enter a name and a valid color.');
      const workspace: Workspace = {
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        name,
        color: input.color,
        icon: input.icon,
        theme: input.theme,
        preferredEmail: input.preferredEmail.trim(),
      };
      return {
        ...m,
        activeWorkspaceId: workspace.id,
        workspaces: upsert(m.workspaces, workspace),
      };
    });
  }
  authorFolder(input: {
    id?: string;
    workspaceId: string;
    parentId: string | null;
    name: string;
    collapsed?: boolean;
  }): Promise<Metadata> {
    return this.update((m) => {
      const old = m.folders.find((f) => f.id === input.id);
      if (input.id && (!old || old.workspaceId !== input.workspaceId))
        throw new Error('Folder no longer exists.');
      const name = input.name.trim();
      if (!name || name.length > 80) throw new Error('Enter a folder name.');
      const folder: Folder = {
        ...old,
        workspaceId: input.workspaceId,
        parentId: input.parentId,
        ...(input.collapsed === undefined
          ? {}
          : { collapsed: input.collapsed }),
        id: old?.id ?? crypto.randomUUID(),
        name,
        order: old?.order ?? m.folders.length,
      };
      return { ...m, folders: upsert(m.folders, folder) };
    });
  }
  removeFolder(id: string): Promise<Metadata> {
    return this.update((m) => {
      if (
        m.pinnedEntries.some((e) => e.folderId === id) ||
        m.folders.some((f) => f.parentId === id)
      )
        throw new Error(
          'Move this folder’s entries and subfolders before removing it.',
        );
      return { ...m, folders: m.folders.filter((f) => f.id !== id) };
    });
  }
  savePinnedEntry(entry: PinnedEntry): Promise<Metadata> {
    return this.update((m) => ({
      ...m,
      pinnedEntries: upsert(m.pinnedEntries, entry),
    }));
  }
  saveFolder(folder: Folder): Promise<Metadata> {
    return this.update((m) => ({ ...m, folders: upsert(m.folders, folder) }));
  }
  private update(change: (m: Metadata) => Metadata): Promise<Metadata> {
    return this.serial(async () => {
      const next = change(await this.read());
      if (!isMetadata(next)) throw new Error('Invalid workspace metadata.');
      await this.area.set({ [METADATA_KEY]: next });
      return next;
    });
  }
}
function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((value) => value.id === item.id);
  return index === -1
    ? [...items, item]
    : items.map((value, i) => (i === index ? item : value));
}
// Foundation for future group switching; browser-session storage clears on browser restart.
export class SessionRepository {
  constructor(private area: StorageArea) {}
  async get(): Promise<WorkspaceSession> {
    const value = (await this.area.get('sidekick.session.v1'))[
      'sidekick.session.v1'
    ];
    return (
      (value as WorkspaceSession | undefined) ?? { memberships: [], groups: [] }
    );
  }
  async save(session: WorkspaceSession): Promise<void> {
    await this.area.set({ 'sidekick.session.v1': session });
  }
}
