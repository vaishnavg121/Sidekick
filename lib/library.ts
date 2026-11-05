import type { Metadata, WorkspaceFavorite } from './models';
import { safeUrl } from './navigation';
import { resourceKey } from './resources';

export interface SavedPage {
  title: string;
  url: string;
}
export interface SavedSession {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  pages: SavedPage[];
}
export interface StoredPage extends SavedPage {
  id: string;
  workspaceId: string;
  createdAt: string;
  dueAt?: number;
  ready?: boolean;
}
export interface Library {
  sessions: SavedSession[];
  snoozed: StoredPage[];
  archive: StoredPage[];
}
export const emptyLibrary = (): Library => ({
  sessions: [],
  snoozed: [],
  archive: [],
});
const id = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length < 200;
const page = (v: SavedPage) => {
  try {
    return (
      v &&
      typeof v.title === 'string' &&
      v.title.length <= 200 &&
      typeof v.url === 'string' &&
      v.url.length <= 4096 &&
      safeUrl(v.url) === v.url
    );
  } catch {
    return false;
  }
};
export function isLibrary(
  value: unknown,
  workspaces: Set<string>,
): value is Library {
  if (!value || typeof value !== 'object') return false;
  const l = value as Library;
  if (
    ![l.sessions, l.snoozed, l.archive].every(
      (a) => Array.isArray(a) && a.length <= 5000,
    )
  )
    return false;
  const rows = [...l.sessions, ...l.snoozed, ...l.archive];
  if (new Set(rows.map((r) => r?.id)).size !== rows.length) return false;
  return (
    rows.every(
      (r) =>
        r &&
        id(r.id) &&
        workspaces.has(r.workspaceId) &&
        typeof r.createdAt === 'string',
    ) &&
    l.sessions.every(
      (s) =>
        typeof s.name === 'string' &&
        s.name.trim().length > 0 &&
        s.name.length <= 80 &&
        Array.isArray(s.pages) &&
        s.pages.length <= 1000 &&
        s.pages.every(page),
    ) &&
    [...l.snoozed, ...l.archive].every(page) &&
    l.snoozed.every(
      (s) =>
        Number.isFinite(s.dueAt) &&
        (s.ready === undefined || typeof s.ready === 'boolean'),
    )
  );
}
export function snapshotPages(pages: SavedPage[]): SavedPage[] {
  const seen = new Set<string>();
  return pages.flatMap((p) => {
    try {
      const url = resourceKey(p.url);
      if (seen.has(url)) return [];
      seen.add(url);
      return [{ title: p.title.slice(0, 200) || url, url }];
    } catch {
      return [];
    }
  });
}
export function storedPage(workspaceId: string, p: SavedPage): StoredPage {
  return {
    ...p,
    url: safeUrl(p.url),
    title: p.title.slice(0, 200),
    id: crypto.randomUUID(),
    workspaceId,
    createdAt: new Date().toISOString(),
  };
}
export function archiveResource(
  metadata: Metadata,
  kind: 'favorite' | 'pinned',
  resourceId: string,
): Metadata {
  const key = kind === 'favorite' ? 'favorites' : 'pinnedEntries';
  const resource = metadata[key].find((e) => e.id === resourceId);
  if (!resource) throw Error('Resource no longer exists.');
  const library = metadata.library ?? emptyLibrary();
  return {
    ...metadata,
    [key]: metadata[key].filter((e) => e.id !== resourceId),
    library: {
      ...library,
      archive: [...library.archive, storedPage(resource.workspaceId, resource)],
    },
  };
}
/** Backups deliberately whitelist fields, excluding keys, session IDs and legacy AI state. */
export function portableMetadata(m: Metadata): Metadata {
  const cleanUrl = (url: string) => {
    const u = new URL(safeUrl(url));
    for (const key of [...u.searchParams.keys()])
      if (/token|secret|auth|password|api.?key|session|code/i.test(key))
        u.searchParams.delete(key);
    return u.href;
  };
  const entry = (e: WorkspaceFavorite) => ({
    id: e.id,
    workspaceId: e.workspaceId,
    title: e.title,
    url: cleanUrl(e.url),
    order: e.order,
  });
  const library = m.library ?? emptyLibrary();
  return {
    version: 1,
    layoutVersion: 2,
    appearance: m.appearance ? structuredClone(m.appearance) : undefined,
    activeWorkspaceId: m.activeWorkspaceId,
    workspaces: m.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      createdAt: w.createdAt,
      icon: w.icon,
      theme: w.theme,
      preferredEmail: w.preferredEmail,
    })),
    preferences: { ...m.preferences },
    favorites: m.favorites.map(entry),
    pinnedEntries: m.pinnedEntries.map((e) => ({
      ...entry(e),
      folderId: e.folderId,
    })),
    folders: m.folders.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      name: f.name,
      parentId: f.parentId,
      order: f.order,
      collapsed: f.collapsed,
    })),
    library: {
      sessions: library.sessions.map((s) => ({
        id: s.id,
        workspaceId: s.workspaceId,
        name: s.name,
        createdAt: s.createdAt,
        pages: s.pages.map((p) => ({ title: p.title, url: cleanUrl(p.url) })),
      })),
      snoozed: library.snoozed.map((s) => ({
        id: s.id,
        workspaceId: s.workspaceId,
        title: s.title,
        url: cleanUrl(s.url),
        createdAt: s.createdAt,
        dueAt: s.dueAt,
        ready: s.ready,
      })),
      archive: library.archive.map((s) => ({
        id: s.id,
        workspaceId: s.workspaceId,
        title: s.title,
        url: cleanUrl(s.url),
        createdAt: s.createdAt,
      })),
    },
  };
}
