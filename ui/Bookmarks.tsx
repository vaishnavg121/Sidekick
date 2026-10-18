import { useEffect, useState } from 'react';
import type { SidebarClient } from '../lib/client';
import type { BookmarkItem } from '../lib/bookmarks';
import { safeUrl } from '../lib/navigation';
import { useSidebar } from '../lib/store';
import { Icon } from './Icon';

function Bookmark({
  item,
  client,
}: {
  item: BookmarkItem;
  client: SidebarClient;
}) {
  const [open, setOpen] = useState(item.id === '0');
  const state = useSidebar();
  if (!item.url)
    return (
      <li className="bookmark-folder">
        <button
          className="folder-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="folder" size={15} />
          {item.title}
          <span>{open ? '−' : '+'}</span>
        </button>
        {open && (
          <ul>
            {item.children?.map((child) => (
              <Bookmark key={child.id} item={child} client={client} />
            ))}
          </ul>
        )}
      </li>
    );
  let supported = true;
  try {
    safeUrl(item.url);
  } catch {
    supported = false;
  }
  const run = (favorite: boolean) => {
    if (!state.metadata || !item.url) return;
    const workspaceId = state.metadata.activeWorkspaceId;
    void client
      .command(
        favorite
          ? {
              type: 'favorite.save',
              title: item.title.slice(0, 200) || item.url.slice(0, 200),
              url: item.url,
              workspaceId,
            }
          : { type: 'navigation.go', input: item.url, newTab: true },
      )
      .catch((e: Error) => state.setError(e.message));
  };
  const added = state.metadata?.favorites.some(
    (f) =>
      f.workspaceId === state.metadata?.activeWorkspaceId && f.url === item.url,
  );
  return (
    <li className="bookmark-row">
      <button
        className="bookmark-open"
        disabled={!supported}
        title={supported ? item.url : 'Unsupported address scheme'}
        onClick={() => run(false)}
      >
        <Icon name="globe" size={14} />
        <span className="truncate">{item.title || item.url}</span>
      </button>
      <button
        className="icon-button"
        disabled={!supported || added}
        aria-label={`Favorite bookmark ${item.title || item.url}`}
        title={
          added ? 'Already a workspace favorite' : 'Add to workspace favorites'
        }
        onClick={() => run(true)}
      >
        <Icon name="star" size={14} />
      </button>
    </li>
  );
}
export function Bookmarks({ client }: { client: SidebarClient }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{
    query: string;
    items?: BookmarkItem[];
    error?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void client
        .request({ type: 'bookmarks.read', query })
        .then((reply) => {
          if (!cancelled) setResult({ query, items: reply.bookmarks ?? [] });
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setResult({
              query,
              error: e instanceof Error ? e.message : 'Bookmarks unavailable.',
            });
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, query]);
  return (
    <section className="bookmarks-view" aria-label="Chrome bookmarks">
      <h2>Chrome bookmarks</h2>
      <p className="field-note">
        Browse your original folders. Stars save a separate copy in this
        workspace.
      </p>
      <input
        className="bookmark-search"
        aria-label="Search bookmarks"
        placeholder="Search bookmarks…"
        maxLength={2000}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {result?.query !== query ? (
        <p role="status">Loading bookmarks…</p>
      ) : result.error ? (
        <p role="alert">{result.error}</p>
      ) : result.items?.length ? (
        <ul className="bookmark-tree">
          {result.items.map((item) => (
            <Bookmark key={item.id} item={item} client={client} />
          ))}
        </ul>
      ) : (
        <p className="field-note">No bookmarks found.</p>
      )}
    </section>
  );
}
