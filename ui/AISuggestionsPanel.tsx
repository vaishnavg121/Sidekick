import { useState } from 'react';
import { useSidebar } from '../lib/store';
import type { SidebarClient } from '../lib/client';
import type { Command } from '../lib/protocol';
import { Icon } from './Icon';
import type { TabItem } from '../lib/tabs';
import type {
  Workspace,
  TabClassification,
  WorkspaceRecommendation,
  RelatedTabGroup,
  FocusRelevance,
  CleanupSuggestion,
} from '../lib/models';

interface SuggestionTabProps {
  tab: TabItem;
  className?: string;
  onClick?: () => void;
  showWorkspace?: boolean;
  workspaceName?: string;
}

function SuggestionTab({
  tab,
  className = '',
  onClick,
  showWorkspace = false,
  workspaceName,
}: SuggestionTabProps) {
  const safeIcon =
    tab.favicon && /^(https?:|data:image\/)/.test(tab.favicon)
      ? tab.favicon
      : undefined;

  return (
    <button
      className={`suggestion-tab ${className}`}
      title={`${tab.title}\n${tab.url}`}
      onClick={onClick}
    >
      <span className="favicon">
        {safeIcon ? (
          <img
            src={safeIcon}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Icon name="globe" size={14} />
        )}
      </span>
      <span className="truncate suggestion-tab-title">{tab.title}</span>
      {showWorkspace && workspaceName && (
        <span className="suggestion-workspace">{workspaceName}</span>
      )}
    </button>
  );
}

function ClassificationSection({
  tabs,
  classifications,
  onAccept,
  onReject,
}: {
  tabs: TabItem[];
  classifications: TabClassification[];
  onAccept: (tabId: number, category: string) => void;
  onReject: (tabId: number) => void;
}) {
  if (classifications.length === 0) return null;

  const tabsByCategory = new Map<
    string,
    (TabClassification & { tab: TabItem })[]
  >();
  for (const cls of classifications) {
    const tab = tabs.find((t) => t.id === cls.tabId);
    if (tab) {
      const list = tabsByCategory.get(cls.category) ?? [];
      list.push({ ...cls, tab });
      tabsByCategory.set(cls.category, list);
    }
  }

  return (
    <section className="ai-section">
      <div className="ai-section-header">
        <Icon name="sparkles" size={14} />
        <h3>Tab Categories</h3>
        <span className="ai-count">{classifications.length} tabs</span>
      </div>
      <div className="ai-categories">
        {Array.from(tabsByCategory.entries()).map(([category, items]) => (
          <div key={category} className="ai-category">
            <div className="ai-category-header">
              <span className="ai-category-name">{category}</span>
              <span className="ai-category-count">{items.length}</span>
            </div>
            <div className="ai-category-items">
              {items.map(({ tab, confidence, reasoning }) => (
                <div key={tab.id} className="ai-suggestion-row">
                  <SuggestionTab tab={tab} />
                  <div className="ai-suggestion-meta">
                    <span className="ai-confidence">
                      {Math.round(confidence * 100)}%
                    </span>
                    <span className="ai-reasoning">{reasoning}</span>
                  </div>
                  <div className="ai-suggestion-actions">
                    <button
                      className="text-button small"
                      onClick={() => onAccept(tab.id, category)}
                    >
                      Accept
                    </button>
                    <button
                      className="text-button small ghost"
                      onClick={() => onReject(tab.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RoutingSection({
  tabs,
  recommendations,
  workspaces,
  rejectedRecommendations,
  onAccept,
  onReject,
}: {
  tabs: TabItem[];
  recommendations: WorkspaceRecommendation[];
  workspaces: Workspace[];
  rejectedRecommendations: Record<number, string[]>;
  onAccept: (tabId: number, workspaceId: string) => void;
  onReject: (tabId: number) => void;
}) {
  if (
    recommendations.length === 0 &&
    Object.keys(rejectedRecommendations).length === 0
  )
    return null;

  return (
    <section className="ai-section">
      <div className="ai-section-header">
        <Icon name="folder" size={14} />
        <h3>Workspace Suggestions</h3>
        <span className="ai-count">{recommendations.length} tabs</span>
      </div>
      <div className="ai-suggestions-list">
        {recommendations.map((rec) => {
          const tab = tabs.find((t) => t.id === rec.tabId);
          const workspace = workspaces.find((w) => w.id === rec.workspaceId);
          if (!tab || !workspace) return null;
          const isRejected =
            rejectedRecommendations[rec.tabId]?.includes(rec.workspaceId) ??
            false;
          return (
            <div
              key={tab.id}
              className={`ai-suggestion-row ${isRejected ? 'rejected' : ''}`}
            >
              <SuggestionTab
                tab={tab}
                showWorkspace
                workspaceName={workspace.name}
              />
              <div className="ai-suggestion-meta">
                <span className="ai-confidence">
                  {Math.round(rec.confidence * 100)}%
                </span>
                <span className="ai-reasoning">{rec.reason}</span>
              </div>
              <div className="ai-suggestion-actions">
                {isRejected ? (
                  <button
                    className="text-button small"
                    onClick={() => onAccept(tab.id, rec.workspaceId)}
                  >
                    Restore
                  </button>
                ) : (
                  <>
                    <button
                      className="text-button small"
                      onClick={() => onAccept(tab.id, rec.workspaceId)}
                    >
                      Move
                    </button>
                    <button
                      className="text-button small ghost"
                      onClick={() => onReject(tab.id)}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {Object.keys(rejectedRecommendations).length > 0 && (
        <div className="ai-rejected-list">
          <h4>Dismissed suggestions</h4>
          {Object.entries(rejectedRecommendations).map(
            ([tabIdStr, workspaceIds]) => {
              const tabId = Number(tabIdStr);
              const tab = tabs.find((t) => t.id === tabId);
              if (!tab) return null;
              return (
                <div key={tabId} className="ai-rejected-item">
                  <SuggestionTab tab={tab} />
                  <span className="ai-rejected-workspaces">
                    {workspaceIds
                      .map((id) => workspaces.find((w) => w.id === id)?.name)
                      .filter((n): n is string => !!n)
                      .join(', ')}
                  </span>
                  <button
                    className="text-button small"
                    onClick={() =>
                      workspaceIds.forEach((wsId) => onAccept(tabId, wsId))
                    }
                  >
                    Restore All
                  </button>
                </div>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}

function GroupSection({
  tabs,
  groups,
  onAccept,
  onReject,
  onRename,
}: {
  tabs: TabItem[];
  groups: RelatedTabGroup[];
  onAccept: (group: RelatedTabGroup) => void;
  onReject: (groupId: string) => void;
  onRename: (groupId: string, newName: string) => void;
}) {
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  if (groups.length === 0) return null;

  const groupId = (g: RelatedTabGroup) => g.tabs.join(',');

  return (
    <section className="ai-section">
      <div className="ai-section-header">
        <Icon name="folder" size={14} />
        <h3>Suggested Groups</h3>
        <span className="ai-count">{groups.length} groups</span>
      </div>
      <div className="ai-suggestions-list">
        {groups.map((group) => {
          const gid = groupId(group);
          const groupTabs = group.tabs
            .map((id) => tabs.find((t) => t.id === id))
            .filter((t): t is TabItem => !!t);
          if (groupTabs.length === 0) return null;

          return (
            <div key={gid} className="ai-group-row">
              <div className="ai-group-header">
                {editingGroup === gid ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onRename(gid, editName);
                        setEditingGroup(null);
                      } else if (e.key === 'Escape') {
                        setEditingGroup(null);
                        setEditName(group.topic);
                      }
                    }}
                    onBlur={() => {
                      onRename(gid, editName);
                      setEditingGroup(null);
                    }}
                    autoFocus
                    className="ai-group-rename-input"
                  />
                ) : (
                  <div
                    className="ai-group-info"
                    onDoubleClick={() => {
                      setEditingGroup(gid);
                      setEditName(group.topic);
                    }}
                  >
                    <span className="ai-group-topic">{group.topic}</span>
                    <span className="ai-group-count">
                      {groupTabs.length} tabs
                    </span>
                  </div>
                )}
                <div className="ai-group-actions">
                  {editingGroup === gid ? (
                    <>
                      <button
                        className="text-button small"
                        onClick={() => {
                          onRename(gid, editName);
                          setEditingGroup(null);
                        }}
                      >
                        Save
                      </button>
                      <button
                        className="text-button small ghost"
                        onClick={() => {
                          setEditingGroup(null);
                          setEditName(group.topic);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="text-button small"
                        onClick={() => onAccept(group)}
                      >
                        Create
                      </button>
                      <button
                        className="text-button small ghost"
                        onClick={() => onReject(gid)}
                      >
                        Dismiss
                      </button>
                      <button
                        className="icon-button tiny"
                        onClick={() => {
                          setEditingGroup(gid);
                          setEditName(group.topic);
                        }}
                        aria-label="Rename group"
                      >
                        <Icon name="settings" size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="ai-group-tabs">
                {groupTabs.map((tab) => (
                  <SuggestionTab key={tab.id} tab={tab} />
                ))}
              </div>
              <p className="ai-group-description">{group.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FocusSection({
  tabs,
  relevance,
  onAccept,
  onReject,
}: {
  tabs: TabItem[];
  relevance: FocusRelevance[];
  onAccept: (tabId: number) => void;
  onReject: (tabId: number) => void;
}) {
  if (relevance.length === 0) return null;

  const sorted = [...relevance].sort((a, b) => b.score - a.score);

  return (
    <section className="ai-section">
      <div className="ai-section-header">
        <Icon name="search" size={14} />
        <h3>Focus Relevance</h3>
        <span className="ai-count">{relevance.length} tabs scored</span>
      </div>
      <div className="ai-suggestions-list">
        {sorted.map((rel) => {
          const tab = tabs.find((t) => t.id === rel.tabId);
          if (!tab) return null;
          const isRelevant = rel.score >= 0.5;
          return (
            <div
              key={tab.id}
              className={`ai-suggestion-row ${isRelevant ? 'relevant' : 'irrelevant'}`}
            >
              <SuggestionTab tab={tab} />
              <div className="ai-suggestion-meta">
                <span className={`ai-score ${isRelevant ? 'high' : 'low'}`}>
                  {Math.round(rel.score * 100)}%
                </span>
                <span className="ai-reasoning">{rel.reason}</span>
              </div>
              <div className="ai-suggestion-actions">
                {isRelevant ? (
                  <button
                    className="text-button small ghost"
                    onClick={() => onReject(tab.id)}
                  >
                    Hide
                  </button>
                ) : (
                  <button
                    className="text-button small"
                    onClick={() => onAccept(tab.id)}
                  >
                    Show
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CleanupSection({
  tabs,
  suggestions,
  onAccept,
  onReject,
}: {
  tabs: TabItem[];
  suggestions: CleanupSuggestion[];
  onAccept: (suggestion: CleanupSuggestion) => void;
  onReject: (suggestion: CleanupSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section className="ai-section">
      <div className="ai-section-header">
        <Icon name="close" size={14} />
        <h3>Cleanup Suggestions</h3>
        <span className="ai-count">{suggestions.length} items</span>
      </div>
      <div className="ai-suggestions-list">
        {suggestions.map((suggestion, idx) => {
          const suggestionTabs = suggestion.tabIds
            .map((id) => tabs.find((t) => t.id === id))
            .filter((t): t is TabItem => !!t);
          if (suggestionTabs.length === 0) return null;

          return (
            <div key={idx} className="ai-cleanup-row">
              <div className="ai-cleanup-header">
                <span className="ai-cleanup-type">{suggestion.type}</span>
                <span className="ai-cleanup-count">
                  {suggestionTabs.length} tabs
                </span>
              </div>
              <p className="ai-cleanup-description">{suggestion.description}</p>
              <div className="ai-cleanup-tabs">
                {suggestionTabs.map((tab) => (
                  <SuggestionTab key={tab.id} tab={tab} />
                ))}
              </div>
              <div className="ai-suggestion-actions">
                <button
                  className="text-button small danger"
                  onClick={() => onAccept(suggestion)}
                >
                  {suggestion.type === 'duplicate'
                    ? 'Remove Duplicates'
                    : 'Clean Up'}
                </button>
                <button
                  className="text-button small ghost"
                  onClick={() => onReject(suggestion)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="ai-loading-overlay">
      <div className="ai-loading-content">
        <div className="spinner large" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export function AISuggestionsPanel({ client }: { client: SidebarClient }) {
  const state = useSidebar();
  const [organizing, setOrganizing] = useState(false);
  const [focusGoal, setFocusGoal] = useState('');
  const [cleanupConfirm, setCleanupConfirm] =
    useState<CleanupSuggestion | null>(null);
  const [lastAction, setLastAction] = useState<{
    type: string;
    data: unknown;
  } | null>(null);

  const {
    tabs,
    metadata,
    ai: {
      classifications,
      recommendations,
      groups,
      focusRelevance,
      cleanupSuggestions,
      isLoading,
      loadingType,
      focusMode,
    },
  } = state;

  const activeWorkspaceId = metadata?.activeWorkspaceId ?? '';
  const workspaces = metadata?.workspaces ?? [];
  const rejectedRecommendations =
    metadata?.aiState?.rejectedRecommendations ?? {};

  const run = (command: Command) => {
    void client.command(command).catch((e: Error) => state.setError(e.message));
  };

  const handleOrganize = async () => {
    if (!tabs.length) return;
    setOrganizing(true);
    state.ai.clearSuggestions();
    const tabIds = tabs.map((t) => t.id);

    try {
      // Run all AI operations in parallel
      await Promise.all([
        client.command({ type: 'ai.classify', tabIds }),
        client.command({ type: 'ai.route', tabIds }),
        client.command({ type: 'ai.group', tabIds }),
        client.command({ type: 'ai.cleanup', tabIds }),
      ]);
    } catch (error) {
      state.setError(
        error instanceof Error ? error.message : 'Organization failed',
      );
    } finally {
      setOrganizing(false);
    }
  };

  const handleFocus = async () => {
    if (!focusGoal.trim() || !tabs.length) return;
    state.ai.setFocusGoal(focusGoal);
    state.ai.setFocusMode(true);
    const tabIds = tabs.map((t) => t.id);
    try {
      await client.command({ type: 'ai.focus', goal: focusGoal, tabIds });
    } catch (error) {
      state.setError(
        error instanceof Error ? error.message : 'Focus analysis failed',
      );
      state.ai.setFocusMode(false);
    }
  };

  const handleExitFocus = () => {
    state.ai.setFocusMode(false);
    state.ai.setFocusGoal('');
    state.ai.setFocusRelevance([]);
  };

  const acceptClassification = (tabId: number, category: string) => {
    // For now, just show acceptance - could apply category as a tag/folder
    run({
      type: 'ai.apply.classification',
      classifications: [
        {
          tabId,
          category: category as TabClassification['category'],
          confidence: 1,
          reasoning: 'User accepted',
        },
      ],
    });
  };

  const rejectClassification = (tabId: number) => {
    state.ai.setClassifications(
      state.ai.classifications.filter((c) => c.tabId !== tabId),
    );
  };

  const acceptRouting = (tabId: number, workspaceId: string) => {
    run({
      type: 'resource.move',
      kind: 'favorite',
      id: String(tabId),
      workspaceId,
      folderId: null,
    });
  };

  const rejectRouting = (tabId: number) => {
    state.ai.setRecommendations(
      state.ai.recommendations.filter((r) => r.tabId !== tabId),
    );
  };

  const acceptGroup = (group: RelatedTabGroup) => {
    // Create a folder for this group
    const folderName = group.topic;
    run({
      type: 'folder.save',
      input: {
        workspaceId: activeWorkspaceId,
        parentId: null,
        name: folderName,
      },
    });
    // Dismiss the suggestion - folder creation is async
    state.ai.setGroups(state.ai.groups.filter((g) => g !== group));
  };

  const rejectGroup = (groupId: string) => {
    state.ai.setGroups(
      state.ai.groups.filter((g) => g.tabs.join(',') !== groupId),
    );
  };

  const renameGroup = (groupId: string, newName: string) => {
    const group = state.ai.groups.find((g) => g.tabs.join(',') === groupId);
    if (group) {
      state.ai.setGroups(
        state.ai.groups.map((g) =>
          g.tabs.join(',') === groupId ? { ...g, topic: newName } : g,
        ),
      );
    }
  };

  const acceptFocus = (tabId: number) => {
    // In focus mode, accepting means keeping the tab visible
    // The focus filtering is handled in the tab list rendering
    // Could add tab to a "shown" list if we had one
    void tabId;
  };

  const rejectFocus = (tabId: number) => {
    // In focus mode, rejecting means hiding the tab
    state.ai.setFocusRelevance(
      state.ai.focusRelevance.filter((r) => r.tabId !== tabId),
    );
  };

  const acceptCleanup = (suggestion: CleanupSuggestion) => {
    setCleanupConfirm(suggestion);
  };

  const confirmCleanup = () => {
    if (!cleanupConfirm) return;
    const suggestion = cleanupConfirm;
    if (suggestion.type === 'duplicate') {
      // Remove duplicate tabs (keep first)
      const toRemove = suggestion.tabIds.slice(1);
      for (const tabId of toRemove) {
        run({ type: 'tab.close', tabId });
      }
    }
    setLastAction({ type: 'cleanup', data: suggestion });
    state.ai.setCleanupSuggestions(
      state.ai.cleanupSuggestions.filter((s) => s !== suggestion),
    );
    setCleanupConfirm(null);
  };

  const cancelCleanup = () => {
    setCleanupConfirm(null);
  };

  const rejectCleanup = (suggestion: CleanupSuggestion) => {
    state.ai.setCleanupSuggestions(
      state.ai.cleanupSuggestions.filter((s) => s !== suggestion),
    );
  };

  const hasSuggestions =
    classifications.length > 0 ||
    recommendations.length > 0 ||
    groups.length > 0 ||
    focusRelevance.length > 0 ||
    cleanupSuggestions.length > 0;

  return (
    <div className="ai-suggestions-panel">
      {!hasSuggestions && !isLoading && !organizing && !focusMode ? (
        <div className="ai-empty-state">
          <Icon name="sparkles" size={32} />
          <h3>Ready to organize</h3>
          <p>Click "Organize with Jev" to analyze your tabs</p>
          <button
            className="text-button primary"
            onClick={handleOrganize}
            disabled={organizing || !state.connected}
          >
            {organizing ? 'Organizing…' : 'Organize with Jev'}
          </button>
        </div>
      ) : (
        <>
          {isLoading && (
            <LoadingOverlay message={`Analyzing tabs (${loadingType})…`} />
          )}
          {organizing && (
            <LoadingOverlay message="Running full organization…" />
          )}

          {!focusMode && (
            <div className="ai-focus-input">
              <label>
                Focus Goal
                <input
                  type="text"
                  value={focusGoal}
                  onChange={(e) => setFocusGoal(e.target.value)}
                  placeholder="e.g., Working on my C++ Limit Order Book project"
                  onKeyDown={(e) => e.key === 'Enter' && handleFocus()}
                />
              </label>
              <button
                className="text-button primary"
                onClick={handleFocus}
                disabled={!focusGoal.trim() || isLoading}
              >
                Enter Focus Mode
              </button>
            </div>
          )}

          {focusMode && (
            <div className="ai-focus-mode-header">
              <h3>Focus: {focusGoal}</h3>
              <button className="text-button ghost" onClick={handleExitFocus}>
                <Icon name="close" size={14} /> Exit Focus Mode
              </button>
            </div>
          )}

          <div className="ai-sections">
            {classifications.length > 0 && (
              <ClassificationSection
                tabs={tabs}
                classifications={classifications}
                onAccept={acceptClassification}
                onReject={rejectClassification}
              />
            )}
            {recommendations.length > 0 && (
              <RoutingSection
                tabs={tabs}
                recommendations={recommendations}
                workspaces={workspaces}
                rejectedRecommendations={rejectedRecommendations}
                onAccept={acceptRouting}
                onReject={rejectRouting}
              />
            )}
            {groups.length > 0 && (
              <GroupSection
                tabs={tabs}
                groups={groups}
                onAccept={acceptGroup}
                onReject={rejectGroup}
                onRename={renameGroup}
              />
            )}
            {focusRelevance.length > 0 && focusMode && (
              <FocusSection
                tabs={tabs}
                relevance={focusRelevance}
                onAccept={acceptFocus}
                onReject={rejectFocus}
              />
            )}
            {cleanupSuggestions.length > 0 && (
              <CleanupSection
                tabs={tabs}
                suggestions={cleanupSuggestions}
                onAccept={acceptCleanup}
                onReject={rejectCleanup}
              />
            )}
          </div>

          {cleanupConfirm && (
            <div className="ai-confirm-overlay">
              <div className="ai-confirm-dialog">
                <h3>Confirm Cleanup</h3>
                <p>
                  {cleanupConfirm.type === 'duplicate'
                    ? `This will close ${cleanupConfirm.tabIds.length - 1} duplicate tab(s). The first tab will be kept.`
                    : `This will remove ${cleanupConfirm.tabIds.length} tab(s) marked as ${cleanupConfirm.type}.`}
                </p>
                <p className="ai-confirm-warning">
                  Closed tabs cannot be automatically restored. Form data and
                  scroll position will be lost.
                </p>
                <div className="ai-confirm-tabs">
                  {cleanupConfirm.tabIds
                    .map((id) => tabs.find((t) => t.id === id))
                    .filter((t): t is TabItem => !!t)
                    .map((tab) => (
                      <SuggestionTab key={tab.id} tab={tab} />
                    ))}
                </div>
                <div className="ai-confirm-actions">
                  <button className="text-button ghost" onClick={cancelCleanup}>
                    Cancel
                  </button>
                  <button
                    className="text-button danger"
                    onClick={confirmCleanup}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {lastAction && (
            <div className="ai-undo-toast">
              <span>Action applied: {lastAction.type}</span>
              <button
                className="text-button small"
                onClick={() => setLastAction(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {!hasSuggestions && !isLoading && (
            <div className="ai-empty-state">
              <Icon name="sparkles" size={32} />
              <h3>No suggestions</h3>
              <p>All tabs look good!</p>
              <button
                className="text-button"
                onClick={handleOrganize}
                disabled={organizing || !state.connected}
              >
                Re-analyze
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
