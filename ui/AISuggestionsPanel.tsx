import { useState } from 'react';
import { useSidebar } from '../lib/store';
import type { SidebarClient } from '../lib/client';
import type { Command } from '../lib/protocol';
import type { CleanupSuggestion } from '../lib/models';
export function AISuggestionsPanel({ client }: { client: SidebarClient }) {
  const state = useSidebar(),
    { tabs, metadata } = state;
  const liveIds = new Set(tabs.map((t) => t.id));
  const ai = {
    ...state.ai,
    classifications: state.ai.classifications.filter((c) =>
      liveIds.has(c.tabId),
    ),
    recommendations: state.ai.recommendations.filter((r) =>
      liveIds.has(r.tabId),
    ),
    groups: state.ai.groups.filter((g) =>
      g.tabs.every((id) => liveIds.has(id)),
    ),
    focusRelevance: state.ai.focusRelevance.filter((r) => liveIds.has(r.tabId)),
    cleanupSuggestions: state.ai.cleanupSuggestions.filter((s) =>
      s.tabIds.every((id) => liveIds.has(id)),
    ),
  };
  const workspaceId = metadata?.activeWorkspaceId ?? '';
  const pref = metadata?.aiState?.focusPreferences[workspaceId];
  const [goal, setGoal] = useState(pref?.goal ?? ''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<CleanupSuggestion>();
  const run = async (c: Command, done?: () => void) => {
    try {
      await client.command(c);
      done?.();
    } catch (e) {
      state.setError(e instanceof Error ? e.message : 'Jev action failed.');
    }
  };
  const title = (id: number) =>
    tabs.find((t) => t.id === id)?.title ?? 'Closed tab';
  const organize = async () => {
    setBusy(true);
    state.setError(undefined);
    ai.clearSuggestions();
    try {
      const tabIds = tabs.filter((t) => !t.restricted).map((t) => t.id);
      await Promise.all([
        client.command({ type: 'ai.classify', tabIds }),
        client.command({ type: 'ai.route', tabIds }),
        client.command({ type: 'ai.group', tabIds }),
        client.command({ type: 'ai.cleanup', tabIds }),
      ]);
    } catch (e) {
      state.setError(e instanceof Error ? e.message : 'Organization failed.');
    } finally {
      setBusy(false);
    }
  };
  const hide = (tabId: number, hidden: boolean) => {
    const hiddenIds = new Set(
      state.windowState.focusHidden?.[workspaceId] ??
        tabs.filter((t) => pref?.hiddenUrls?.includes(t.url)).map((t) => t.id),
    );
    if (hidden) hiddenIds.add(tabId);
    else hiddenIds.delete(tabId);
    void run({
      type: 'focus.update',
      goal: pref?.goal ?? goal,
      mode: true,
      hiddenTabIds: [...hiddenIds],
    });
  };
  return (
    <div className="ai-panel settings-view">
      <div className="eyebrow">OPTIONAL INTELLIGENCE</div>
      <h2>Organize with Jev</h2>
      <p className="field-note">
        {metadata?.aiSettings?.provider === 'vercel'
          ? 'Vercel AI Gateway · typesafe-ai/jev'
          : `TypeSafe Direct · ${metadata?.aiSettings?.lastModel ?? 'jev-latest'}`}
      </p>
      <p className="field-note">
        Review every suggestion before applying. Selected titles and domains,
        workspace names and your focus goal go to your selected AI provider.
        Page content and full URLs stay here. Jev returns decisions, not
        generated explanations.
      </p>
      {metadata?.aiSettings?.status !== 'connected' ? (
        <>
          <p>
            Connect your own TypeSafe Direct key in secure settings to use Jev.
          </p>
          <button
            className="text-button"
            onClick={() => void run({ type: 'settings.open' })}
          >
            Open secure AI settings
          </button>
        </>
      ) : (
        <button
          className="text-button"
          disabled={busy || !tabs.length}
          onClick={() => void organize()}
        >
          {busy ? 'Evaluating…' : 'Analyze workspace tabs'}
        </button>
      )}
      <form
        className="shortcut-form"
        aria-label="Focus goal"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void run({
            type: 'ai.focus',
            goal,
            tabIds: tabs.filter((t) => !t.restricted).map((t) => t.id),
          }).finally(() => setBusy(false));
        }}
      >
        <label>
          Workspace focus goal
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={500}
            required
          />
        </label>
        <button
          className="text-button"
          disabled={busy || metadata?.aiSettings?.status !== 'connected'}
        >
          Evaluate focus
        </button>
      </form>
      <button
        className="text-button"
        aria-pressed={pref?.mode ?? false}
        onClick={() =>
          void run({
            type: 'focus.update',
            goal: pref?.goal ?? goal,
            mode: !pref?.mode,
          })
        }
      >
        {pref?.mode ? 'Exit Focus / Show All' : 'Enable saved Focus Mode'}
      </button>
      {ai.classifications.length > 0 && (
        <section className="ai-section">
          <h3>Categories</h3>
          {ai.classifications.map((c) => (
            <article className="info-card" key={c.tabId}>
              <strong>{title(c.tabId)}</strong>
              <label className="ai-category-edit">
                Category
                <select
                  aria-label={`Category for ${title(c.tabId)}`}
                  value={c.category}
                  onChange={(e) =>
                    ai.setClassifications(
                      ai.classifications.map((v) =>
                        v.tabId === c.tabId
                          ? {
                              ...v,
                              category: e.target.value as typeof c.category,
                              confidence: 1,
                              reasoning: 'Manually selected category',
                            }
                          : v,
                      ),
                    )
                  }
                >
                  {[
                    'Development',
                    'Research',
                    'Education',
                    'Documentation',
                    'Productivity',
                    'Entertainment',
                    'Shopping',
                    'Communication',
                    'Other',
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <p>
                {c.reasoning === 'Manually selected category' ? (
                  'Manually selected'
                ) : (
                  <>
                    {c.category} / {Math.round(c.confidence * 100)}%
                    selected-option probability
                  </>
                )}
              </p>
              <button
                className="text-button"
                onClick={() =>
                  void run(
                    { type: 'ai.apply.classification', classifications: [c] },
                    () =>
                      ai.setClassifications(
                        ai.classifications.filter((v) => v.tabId !== c.tabId),
                      ),
                  )
                }
              >
                Accept category
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void run(
                    {
                      type: 'ai.classification.reject',
                      tabId: c.tabId,
                      category: c.category,
                    },
                    () =>
                      ai.setClassifications(
                        ai.classifications.filter((v) => v.tabId !== c.tabId),
                      ),
                  )
                }
              >
                Dismiss category
              </button>
            </article>
          ))}
        </section>
      )}
      {ai.recommendations.length > 0 && (
        <section className="ai-section">
          <h3>Workspace routing</h3>
          {ai.recommendations.map((r) => (
            <article className="info-card" key={r.tabId}>
              <strong>{title(r.tabId)}</strong>
              <p>
                Move to {r.workspaceName} / {Math.round(r.confidence * 100)}%
                selected-option probability
              </p>
              <button
                className="text-button"
                onClick={() =>
                  void run(
                    { type: 'ai.apply.routing', recommendations: [r] },
                    () =>
                      ai.setRecommendations(
                        ai.recommendations.filter((v) => v.tabId !== r.tabId),
                      ),
                  )
                }
              >
                Accept move
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void run(
                    {
                      type: 'ai.route.reject',
                      tabId: r.tabId,
                      workspaceId: r.workspaceId,
                    },
                    () =>
                      ai.setRecommendations(
                        ai.recommendations.filter((v) => v.tabId !== r.tabId),
                      ),
                  )
                }
              >
                Reject recommendation
              </button>
            </article>
          ))}
        </section>
      )}
      {ai.groups.length > 0 && (
        <section className="ai-section">
          <h3>Related tabs</h3>
          <p className="field-note">
            Accepting creates a native Chrome tab group. Pages stay alive and
            remain ordinary tabs.
          </p>
          {ai.groups.map((g) => (
            <article className="info-card" key={g.tabs.join(',')}>
              <strong>{g.topic}</strong>
              <ul>
                {g.tabs.map((id) => (
                  <li key={id}>{title(id)}</li>
                ))}
              </ul>
              <button
                className="text-button"
                onClick={() =>
                  void run({ type: 'ai.apply.groups', groups: [g] }, () =>
                    ai.setGroups(ai.groups.filter((v) => v !== g)),
                  )
                }
              >
                Accept tab group
              </button>
              <button
                className="text-button"
                onClick={() => ai.setGroups(ai.groups.filter((v) => v !== g))}
              >
                Dismiss group
              </button>
            </article>
          ))}
        </section>
      )}
      {ai.focusRelevance.length > 0 && (
        <section className="ai-section">
          <h3>Focus relevance</h3>
          {ai.focusRelevance.map((r) => (
            <article className="info-card" key={r.tabId}>
              <strong>{title(r.tabId)}</strong>
              <p>Relevance {Math.round(r.score * 100)}%</p>
              <button
                className="text-button"
                onClick={() => {
                  const t = tabs.find((t) => t.id === r.tabId);
                  if (t) hide(t.id, false);
                }}
              >
                Keep visible
              </button>
              <button
                className="text-button"
                onClick={() => {
                  const t = tabs.find((t) => t.id === r.tabId);
                  if (t) hide(t.id, true);
                }}
              >
                Hide during Focus
              </button>
            </article>
          ))}
        </section>
      )}
      {ai.cleanupSuggestions.length > 0 && (
        <section className="ai-section">
          <h3>Cleanup suggestions</h3>
          <p className="field-note">
            Even exact URLs can have different unsaved state. Review before
            closing. Archive recovery restores URLs, not forms or navigation
            history.
          </p>
          {ai.cleanupSuggestions.map((s, i) => (
            <article className="info-card" key={i}>
              <strong>{s.type}</strong>
              <ul>
                {s.tabIds.map((id) => (
                  <li key={id}>{title(id)}</li>
                ))}
              </ul>
              <button className="text-button" onClick={() => setConfirm(s)}>
                Review cleanup
              </button>
              <button
                className="text-button"
                onClick={() =>
                  ai.setCleanupSuggestions(
                    ai.cleanupSuggestions.filter((v) => v !== s),
                  )
                }
              >
                Keep these tabs
              </button>
            </article>
          ))}
        </section>
      )}
      {confirm && confirm.tabIds.every((id) => liveIds.has(id)) && (
        <div
          className="info-card"
          role="group"
          aria-label="Confirm tab cleanup"
        >
          <strong>
            Archive URL copies and close {confirm.tabIds.length} tab(s)?
          </strong>
          <ul>
            {confirm.tabIds.map((id) => (
              <li key={id}>{title(id)}</li>
            ))}
          </ul>
          <p>
            Unsaved form data and page sessions cannot be recovered from an
            archive.
          </p>
          <button
            className="text-button danger"
            onClick={() =>
              void run(
                { type: 'ai.apply.cleanup', suggestions: [confirm] },
                () => {
                  ai.setCleanupSuggestions(
                    ai.cleanupSuggestions.filter((v) => v !== confirm),
                  );
                  setConfirm(undefined);
                },
              )
            }
          >
            Confirm archive and close
          </button>
          <button className="text-button" onClick={() => setConfirm(undefined)}>
            Cancel cleanup
          </button>
        </div>
      )}
    </div>
  );
}
