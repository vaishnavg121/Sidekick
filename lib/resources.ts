import type {
  Metadata,
  ResourceKind,
  WorkspaceFavorite,
  PinnedEntry,
} from './models';
import { safeUrl } from './navigation';
export function resourceKey(url: string): string {
  const normalized = new URL(safeUrl(url));
  if (normalized.protocol === 'chrome:' && !normalized.pathname)
    normalized.pathname = '/';
  return normalized.href;
}
export function collection(
  metadata: Metadata,
  kind: ResourceKind,
): WorkspaceFavorite[] {
  return kind === 'favorite' ? metadata.favorites : metadata.pinnedEntries;
}
export interface ResourceInput {
  id?: string;
  workspaceId: string;
  title: string;
  url: string;
  favicon?: string;
  folderId?: string | null;
}
export function saveResource(
  metadata: Metadata,
  kind: ResourceKind,
  input: ResourceInput,
): Metadata {
  const url = resourceKey(input.url.trim());
  if (!metadata.workspaces.some((w) => w.id === input.workspaceId))
    throw new Error('Workspace no longer exists.');
  const items = collection(metadata, kind);
  const existing = input.id ? items.find((e) => e.id === input.id) : undefined;
  if (input.id && !existing) throw new Error('Entry no longer exists.');
  const duplicate = items.find((e) => {
    if (e.workspaceId !== input.workspaceId || e.id === input.id) return false;
    try {
      return resourceKey(e.url) === url;
    } catch {
      return false;
    }
  });
  if (duplicate) {
    if (input.id)
      throw new Error('This address is already saved in that workspace.');
    return metadata;
  }
  const title = input.title.trim();
  if (!title || title.length > 200)
    throw new Error('Enter a name of up to 200 characters.');
  const entry: WorkspaceFavorite = {
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    title,
    url,
    order:
      existing?.workspaceId === input.workspaceId &&
      (kind === 'favorite' ||
        (existing as PinnedEntry).folderId === (input.folderId ?? null))
        ? existing.order
        : items.filter(
            (e) =>
              e.workspaceId === input.workspaceId &&
              (kind === 'favorite' ||
                (e as PinnedEntry).folderId === (input.folderId ?? null)),
          ).length,
    ...(input.favicon ? { favicon: input.favicon } : {}),
  };
  const key = kind === 'favorite' ? 'favorites' : 'pinnedEntries';
  const result =
    kind === 'pinned'
      ? ({ ...entry, folderId: input.folderId ?? null } as PinnedEntry)
      : entry;
  return {
    ...metadata,
    [key]: existing
      ? items.map((e) => (e.id === existing.id ? result : e))
      : [...items, result],
  };
}
export function reorderResources(
  metadata: Metadata,
  kind: ResourceKind,
  workspaceId: string,
  ids: string[],
  folderId: string | null,
): Metadata {
  const items = collection(metadata, kind);
  const siblings = items.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      (kind === 'favorite' || (e as PinnedEntry).folderId === folderId),
  );
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== siblings.length ||
    siblings.some((e) => !ids.includes(e.id))
  )
    throw new Error('The list changed. Try reordering again.');
  const order = new Map(ids.map((id, index) => [id, index]));
  return {
    ...metadata,
    [kind === 'favorite' ? 'favorites' : 'pinnedEntries']: items.map((e) =>
      order.has(e.id) ? { ...e, order: order.get(e.id)! } : e,
    ),
  };
}
