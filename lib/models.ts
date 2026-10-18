export type SidebarMode = 'hidden' | 'hover' | 'pinned';
export interface SidebarPreferences {
  mode: SidebarMode;
  width: number;
  openDelay: number;
  closeDelay: number;
}
export interface Workspace {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  preferredEmail?: string;
}
export interface WorkspaceFavorite {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  order: number;
}
export interface PinnedEntry extends WorkspaceFavorite {
  folderId: string | null;
}
export interface Folder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  order: number;
}
export interface Metadata {
  version: 1;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  favorites: WorkspaceFavorite[];
  pinnedEntries: PinnedEntry[];
  folders: Folder[];
  preferences: SidebarPreferences;
}
// Browser-session handles only. Never persist these in chrome.storage.local.
export interface SessionMembership {
  tabId: number;
  workspaceId: string;
  windowId: number;
}
export interface WorkspaceSession {
  memberships: SessionMembership[];
  groups: { workspaceId: string; windowId: number; groupId: number }[];
}
// A future implementation can manage groups in one window without changing metadata.
export interface WorkspaceSwitcher {
  activate(workspaceId: string, windowId: number): Promise<void>;
}
// Deliberately no implementation or key material in milestone 1.
export interface SecretProvider {
  getGatewayKey(): Promise<string | undefined>;
  clearGatewayKey(): Promise<void>;
}
export const DEFAULT_PREFERENCES: SidebarPreferences = {
  mode: 'hover',
  width: 300,
  openDelay: 180,
  closeDelay: 350,
};
export function normalizePreferences(
  value: Partial<SidebarPreferences>,
): SidebarPreferences {
  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n)
      ? Math.round(Math.min(max, Math.max(min, n)))
      : fallback;
  return {
    mode: ['hidden', 'hover', 'pinned'].includes(value.mode ?? '')
      ? value.mode!
      : 'hover',
    width: clamp(value.width, 240, 440, 300),
    openDelay: clamp(value.openDelay, 0, 1500, 180),
    closeDelay: clamp(value.closeDelay, 100, 2000, 350),
  };
}
export function createMetadata(): Metadata {
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: 'Personal',
    color: '#b7a3ff',
    createdAt: new Date().toISOString(),
  };
  return {
    version: 1,
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    favorites: [],
    pinnedEntries: [],
    folders: [],
    preferences: { ...DEFAULT_PREFERENCES },
  };
}
export function validateFolders(
  folders: Folder[],
  workspaceIds: Set<string>,
): boolean {
  const map = new Map(folders.map((folder) => [folder.id, folder]));
  if (map.size !== folders.length) return false;
  return folders.every((folder) => {
    if (!workspaceIds.has(folder.workspaceId)) return false;
    const seen = new Set([folder.id]);
    let parent = folder.parentId;
    while (parent !== null) {
      const node = map.get(parent);
      if (!node || node.workspaceId !== folder.workspaceId || seen.has(parent))
        return false;
      seen.add(parent);
      parent = node.parentId;
    }
    return true;
  });
}
