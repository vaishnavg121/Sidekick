import type { DragEvent } from 'react';
export type DragKind = 'favorite' | 'pinned' | 'tab' | 'folder' | 'workspace';
export interface DragItem {
  kind: DragKind;
  id: string;
  workspaceId: string;
  folderId?: string | null;
}
export const DRAG_TYPE = 'application/x-sidekick-entry';
export function startDrag(event: DragEvent, item: DragItem) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  event.dataTransfer.effectAllowed = 'move';
}
export function readDrag(event: DragEvent): DragItem | undefined {
  const root = event.currentTarget.getRootNode() as Document | ShadowRoot;
  root
    .querySelectorAll('.drop-ready')
    .forEach((node) => node.classList.remove('drop-ready'));
  try {
    const value = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DragItem;
    if (
      ['favorite', 'pinned', 'tab', 'folder', 'workspace'].includes(
        value.kind,
      ) &&
      typeof value.id === 'string' &&
      typeof value.workspaceId === 'string' &&
      (value.folderId === undefined ||
        value.folderId === null ||
        typeof value.folderId === 'string')
    )
      return value;
  } catch {
    /* Ignore unrelated website drags. */
  }
}
export function allowDrag(event: DragEvent) {
  if (event.dataTransfer.types.includes(DRAG_TYPE)) {
    event.currentTarget.classList.add('drop-ready');
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }
}
export function setDragImage(event: DragEvent, title: string) {
  // Create a drag preview element
  const preview = document.createElement('div');
  preview.textContent = title;
  preview.style.cssText = `
    position: absolute;
    top: -1000px;
    left: -1000px;
    padding: 8px 12px;
    background: var(--sk-bg, #1b1c22);
    border: 1px solid var(--sk-border, #ffffff16);
    border-radius: 6px;
    color: var(--sk-text, #ececf0);
    font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    white-space: nowrap;
    box-shadow: 0 4px 12px #0006;
    pointer-events: none;
    z-index: 2147483647;
  `;
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 10, 10);
  requestAnimationFrame(() => {
    preview.remove();
  });
}
export function validateDragItem(
  item: DragItem,
  validKinds: DragKind[],
  allowedWorkspaceIds?: string[],
): boolean {
  if (!item || !validKinds.includes(item.kind)) return false;
  if (allowedWorkspaceIds && !allowedWorkspaceIds.includes(item.workspaceId))
    return false;
  if (typeof item.id !== 'string' || typeof item.workspaceId !== 'string')
    return false;
  return true;
}
