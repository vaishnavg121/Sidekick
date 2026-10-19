import type { DragEvent } from 'react';
export interface DragItem {
  kind: 'favorite' | 'pinned' | 'tab';
  id: string;
  workspaceId: string;
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
      ['favorite', 'pinned', 'tab'].includes(value.kind) &&
      typeof value.id === 'string' &&
      typeof value.workspaceId === 'string'
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
