import type { WorkspaceFavorite } from '../lib/models';
import { useSidebar } from '../lib/store';
export function SiteIcon({ entry }: { entry: WorkspaceFavorite }) {
  const live = useSidebar(
    (s) => s.tabs.find((tab) => tab.url === entry.url)?.favicon,
  );
  let fallback: string | undefined;
  try {
    const url = new URL(entry.url);
    if (url.protocol === 'https:' || url.protocol === 'http:')
      fallback = url.origin + '/favicon.ico';
  } catch {
    /* Letter fallback below. */
  }
  const source = live || entry.favicon || fallback;
  const safe =
    source &&
    (source.startsWith('https:') ||
      source.startsWith('http:') ||
      source.startsWith('data:image/'))
      ? source
      : undefined;
  return (
    <span className="site-icon">
      <span aria-hidden="true">{entry.title.charAt(0).toUpperCase()}</span>
      {safe && (
        <img
          key={safe}
          src={safe}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
}
