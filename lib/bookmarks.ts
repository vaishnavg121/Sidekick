export interface BookmarkItem {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkItem[];
}
export function bookmarkItems(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): BookmarkItem[] {
  return nodes.map((node) => ({
    id: node.id,
    title:
      node.title || (node.id === '0' ? 'Chrome bookmarks' : 'Untitled folder'),
    ...(node.url ? { url: node.url } : {}),
    ...(node.children ? { children: bookmarkItems(node.children) } : {}),
  }));
}
export async function readBookmarks(query: string): Promise<BookmarkItem[]> {
  // No Chrome bookmark write API is used anywhere in the application.
  return bookmarkItems(
    query.trim()
      ? await chrome.bookmarks.search(query.trim())
      : await chrome.bookmarks.getTree(),
  );
}
