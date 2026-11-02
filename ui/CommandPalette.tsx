import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { Icon } from './Icon';
import {
  searchCommandPalette,
  groupResults,
  type CommandPaletteResult,
  type CommandPaletteAction,
} from '../lib/command-palette';
import type { TabItem } from '../lib/tabs';
import type { BookmarkItem } from '../lib/bookmarks';
import type {
  Metadata,
  Workspace,
  WorkspaceFavorite,
  PinnedEntry,
} from '../lib/models';

type IconName =
  | 'search'
  | 'plus'
  | 'settings'
  | 'collapse'
  | 'close'
  | 'star'
  | 'pin'
  | 'arrow'
  | 'globe'
  | 'back'
  | 'reload'
  | 'stop'
  | 'copy'
  | 'fullscreen'
  | 'folder'
  | 'sparkles';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: CommandPaletteAction) => void;
  metadata?: Metadata;
  tabs: TabItem[];
  bookmarks: BookmarkItem[];
  isImmersive?: boolean;
}

function buildSearchIndex(
  tabs: TabItem[],
  workspaces: Workspace[],
  favorites: WorkspaceFavorite[],
  pinned: PinnedEntry[],
  bookmarks: BookmarkItem[],
  activeWorkspaceId: string,
  activeTabId?: number,
) {
  return {
    tabs,
    workspaces,
    favorites,
    pinned,
    bookmarks,
    activeWorkspaceId,
    activeTabId,
  };
}

export function CommandPalette({
  isOpen,
  onClose,
  onAction,
  metadata,
  tabs,
  bookmarks,
  isImmersive = false,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const activeTab = tabs.find((t) => t.active);
  const hasActiveTab = !!activeTab;
  const activeWorkspaceId = metadata?.activeWorkspaceId ?? '';
  const workspaces = metadata?.workspaces ?? [];
  const favorites = metadata?.favorites ?? [];
  const pinned = metadata?.pinnedEntries ?? [];

  // Build search index (memoized to prevent unnecessary recalculations)
  const searchIndex = useMemo(
    () =>
      buildSearchIndex(
        tabs,
        workspaces,
        favorites,
        pinned,
        bookmarks,
        activeWorkspaceId,
        activeTab?.id,
      ),
    [
      tabs,
      workspaces,
      favorites,
      pinned,
      bookmarks,
      activeWorkspaceId,
      activeTab?.id,
    ],
  );

  // Compute results directly during render using useMemo (derived state)
  const results = useMemo(() => {
    return searchCommandPalette(searchIndex, query, {
      isImmersive,
      hasActiveTab,
    });
  }, [query, searchIndex, isImmersive, hasActiveTab]);

  const groups = useMemo(() => groupResults(results), [results]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Small delay to ensure render is complete
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    } else if (previousActiveElement.current) {
      // Restore focus to previous element
      previousActiveElement.current.focus({ preventScroll: true });
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const maxIndex = results.length - 1;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            onAction(results[selectedIndex].action);
            onClose();
          }
          break;
        case 'Tab':
          // Allow default tab behavior for accessibility
          break;
        default:
          break;
      }
    },
    [results, selectedIndex, onClose, onAction],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(0);
  };

  const handleResultClick = (result: CommandPaletteResult) => {
    onAction(result.action);
    onClose();
  };

  if (!isOpen) return null;

  const groupEntries = Array.from(groups.entries());

  return (
    <div
      ref={overlayRef}
      className="command-palette-overlay"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div className="command-palette">
        <div className="command-palette-input-wrapper">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search tabs, workspaces, favorites, bookmarks, or type a URL…"
            aria-label="Command palette search"
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
          />
          <kbd className="command-palette-hint">↵</kbd>
        </div>

        {query && results.length === 0 && (
          <div className="command-palette-empty">
            <Icon name="search" size={24} />
            <p>
              No results for <strong>{escapeHtml(query)}</strong>
            </p>
            <span>Try a different search or enter a URL</span>
          </div>
        )}

        {!query && results.length === 0 && (
          <div className="command-palette-empty">
            <Icon name="sparkles" size={24} />
            <p>Start typing to search</p>
            <span>Tabs, workspaces, favorites, bookmarks, actions</span>
          </div>
        )}

        {groupEntries.map(([groupName, groupResults]) => (
          <div key={groupName} className="command-palette-group">
            <div className="command-palette-group-label">{groupName}</div>
            <ul className="command-palette-list" role="listbox">
              {groupResults.map((result) => {
                const globalIndex = results.indexOf(result);
                const isSelected = globalIndex === selectedIndex;
                return (
                  <li
                    key={result.id}
                    className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleResultClick(result)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                  >
                    {(result.favicon || result.icon) && (
                      <div className="command-palette-icon">
                        {result.favicon ? (
                          <img
                            src={result.favicon}
                            alt=""
                            referrerPolicy="no-referrer"
                            width={16}
                            height={16}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          result.icon && (
                            <Icon name={result.icon as IconName} size={16} />
                          )
                        )}
                      </div>
                    )}
                    <div className="command-palette-content">
                      <span className="command-palette-title">
                        {escapeHtml(result.title)}
                      </span>
                      {result.description && (
                        <span className="command-palette-description">
                          {escapeHtml(result.description)}
                        </span>
                      )}
                    </div>
                    {result.category === 'tabs' && (
                      <span className="command-palette-badge">Tab</span>
                    )}
                    {result.category === 'workspaces' && (
                      <span className="command-palette-badge">Workspace</span>
                    )}
                    {result.category === 'favorites' && (
                      <span className="command-palette-badge">Favorite</span>
                    )}
                    {result.category === 'pinned' && (
                      <span className="command-palette-badge">Pinned</span>
                    )}
                    {result.category === 'bookmarks' && (
                      <span className="command-palette-badge">Bookmark</span>
                    )}
                    {result.category === 'actions' && (
                      <span className="command-palette-badge">Action</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}
