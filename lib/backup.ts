import { isMetadata } from './repository';
import type { Metadata } from './models';
import { portableMetadata, emptyLibrary } from './library';

export interface Backup {
  format: 'sidekick-backup';
  version: 1;
  exportedAt: string;
  metadata: Metadata;
}
export function exportBackup(m: Metadata): Backup {
  return {
    format: 'sidekick-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: portableMetadata(m),
  };
}
export function parseBackup(text: string): Backup {
  if (text.length > 5_000_000)
    throw Error('Backup exceeds the 5 MB import limit.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error('Backup is not valid JSON. Existing data was preserved.');
  }
  const b = value as Backup;
  // Support the original exported metadata schema as well as the portable wrapper.
  if (isMetadata(value)) return exportBackup(value);
  if (
    !b ||
    b.format !== 'sidekick-backup' ||
    b.version !== 1 ||
    !isMetadata(b.metadata)
  )
    throw Error(
      'Unsupported or invalid Sidekick backup. Existing data was preserved.',
    );
  return exportBackup(b.metadata);
}
/** Import as independent workspace copies. Never overwrite current definitions or preferences. */
export function mergeBackup(current: Metadata, backup: Backup): Metadata {
  const incoming = backup.metadata;
  const workspaceIds = new Map(
    incoming.workspaces.map((w) => [w.id, crypto.randomUUID()]),
  );
  const folderIds = new Map(
    incoming.folders.map((f) => [f.id, crypto.randomUUID()]),
  );
  const workspaceId = (id: string) => workspaceIds.get(id)!;
  const importedLibrary = incoming.library ?? emptyLibrary(),
    library = current.library ?? emptyLibrary();
  return {
    ...current,
    workspaces: [
      ...current.workspaces,
      ...incoming.workspaces.map((w) => ({
        ...w,
        id: workspaceId(w.id),
        name: (w.name + ' · imported').slice(0, 60),
      })),
    ],
    folders: [
      ...current.folders,
      ...incoming.folders.map((f) => ({
        ...f,
        id: folderIds.get(f.id)!,
        workspaceId: workspaceId(f.workspaceId),
        parentId: f.parentId ? folderIds.get(f.parentId)! : null,
      })),
    ],
    favorites: [
      ...current.favorites,
      ...incoming.favorites.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        workspaceId: workspaceId(e.workspaceId),
      })),
    ],
    pinnedEntries: [
      ...current.pinnedEntries,
      ...incoming.pinnedEntries.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        workspaceId: workspaceId(e.workspaceId),
        folderId: e.folderId ? folderIds.get(e.folderId)! : null,
      })),
    ],
    library: {
      sessions: [
        ...library.sessions,
        ...importedLibrary.sessions.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          workspaceId: workspaceId(s.workspaceId),
        })),
      ],
      snoozed: [
        ...library.snoozed,
        ...importedLibrary.snoozed.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          workspaceId: workspaceId(s.workspaceId),
        })),
      ],
      archive: [
        ...library.archive,
        ...importedLibrary.archive.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          workspaceId: workspaceId(s.workspaceId),
        })),
      ],
    },
  };
}
