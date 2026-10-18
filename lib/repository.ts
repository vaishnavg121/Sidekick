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
} from './models';

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
        Number.isFinite(e.order),
    )
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
        Number.isFinite(f.order),
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
