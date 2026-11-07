# Architecture and integrity

WXT builds the MV3 background worker, top-frame HTTP/HTTPS content script, native panel, explicit dashboard and trusted options page. The shared sidebar is isolated in a closed Shadow DOM on websites. Chrome's original New Tab is preserved.

| Area                                                                                  | Owner                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Chrome command/sender validation and snapshots                                        | `entrypoints/background.ts`                              |
| Logical ownership, window selection, last active tab, lifecycle/restart and URL reuse | `lib/workspaces.ts`                                      |
| Session window/search/fullscreen/native-panel/Focus state                             | `lib/window-state.ts`                                    |
| Atomic validated local mutations and additive models                                  | `lib/repository.ts`, `lib/models.ts`                     |
| Saved resources, ordering, deduplication and folder subtree moves                     | `lib/resources.ts`, `lib/resource-service.ts`            |
| Serialized alarms/sessions/archive/import                                             | `lib/productivity.ts`, `lib/library.ts`, `lib/backup.ts` |
| Sanitized bounded optional Gateway integration                                        | `lib/ai-service.ts`                                      |
| Local ranking and action descriptions                                                 | `lib/command-palette.ts`                                 |
| Reversible layout and narrow adapters                                                 | `lib/docking.ts`, `lib/dock-adapters.ts`                 |
| Shared controls, resource editors, palette, Library, AI review                        | `ui/`                                                    |

## State boundaries

`sidekick.metadata.v1` stays version 1. Optional additive Library/onboarding/URL-based AI/Focus fields retain existing resource/workspace IDs and display preferences. `layoutVersion: 2` retains the prior one-time layout migration. Invalid metadata is preserved and reported, never reset silently.

`sidekick.memberships.v2` maps current tab handles to logical workspace/window ownership in `chrome.storage.session`. Window selection, last-active tracking and live hidden IDs are session-only. Legacy SessionRepository schema remains compatible; the runtime uses the v2 engine.

Local bounded URL-hash fingerprints help reconcile reload and changed browser IDs. Startup recovery ends when explicit workspace operations begin, so hints cannot hijack normal new-tab inheritance. Unambiguous restored owners are adopted; stale IDs are cleaned and ambiguous tabs inherit a valid window selection. No automatic browser-session recreation occurs.

Workspace switching preserves live pages. Manual Chrome activation follows ownership; programmatic activation events are tracked so delayed events cannot undo a newer selection. Opening a saved shortcut reuses a same-window exact match and explicitly adopts it into that resource's workspace, without reloading.

## Validation and concurrency

The background checks extension sender identity, resolves website windows from actual Chrome tabs, validates payload structure, and validates live/resource ownership against authoritative state. Drag payloads are hints. Cross-window forged operations, invalid folders, cycles and URL collisions fail before mutation.

Metadata, window state, workspace operations and productivity operations use serialized queues. Folder subtree writes are atomic. Native tab reordering uses actual Chrome indices and respects pinned/group boundaries. Empty-workspace deletion checks every window and all Library/resource data. Refreshes coalesce events and reuse one snapshot per window across clients; hashes/cache are bounded and unchanged fingerprints avoid writes.

Snooze stores the recovery URL before explicitly requested closure, then creates an alarm; startup recreates outstanding alarms. Due reminders persist until restore/cancel. Restore serializes exact safe-URL reuse. Import previews are validated, window-bound, expiring and consumed after success; merge creates independent IDs and leaves current data/preferences intact.

## AI boundary

Only trusted extension pages can configure keys. Snapshot settings are explicitly rebuilt without credentials. Keys reload on worker requests; key changes clear cached results. The fixed HTTPS endpoint disallows redirects/credentials, uses a 20-second timeout and exposes no raw remote error body.

The [official Vercel contract](https://vercel.com/docs/ai-gateway/modalities/decision) maps named questions to typed answers. Choice UI shows the returned selected-option probability, not generated explanations. Scores normalize the authored six-rung rubric. Invalid/missing categories/scores fail without changing categories/hiding tabs. Routing criteria use workspace IDs; a single workspace needs no routing evaluation. Group acceptance creates native Chrome tab groups, never durable pins.

Focus goals/preferences are durable per workspace; individual live hidden IDs remain per-window session state. URL fallback handles restart conservatively. Backup whitelist excludes keys and AI/session state. See [privacy](privacy.md) and [testing](testing.md).

## Appearance and inference additions (0.3.0)

`lib/appearance.ts` owns typed settings, seven presets, strict JSON/color/range validation, HSV conversions and generated CSS variables. `ui/AppearanceStudio.tsx` previews via scoped requestAnimationFrame updates; only Apply writes metadata. `ui/theme.ts` resolves workspace override → global preference → legacy light/dark/system. Device mode supplies the standard base while retaining custom accents/effects. Zero blur produces no filter; nonzero blur uses the standard CSS property. CSS effects remain on Sidekick surfaces, not webpage content.

Optional `metadata.appearance` and `aiState.dismissedCategoriesByUrl` retain version 1 and every existing ID. Old metadata remains valid without an appearance migration/reset. Theme exports include no browsing/account state; portable backups remap overrides to imported copies. A same-path v0.2.0 upgrade fixture verifies unchanged IDs/resources/settings/Library data.

`lib/ai-guard.ts` records input identity and a latest-request token per feature/window. Changed workspace, tab closure, navigation/title changes or superseding requests suppress results before Focus persistence. Gateway parsing verifies complete question maps/types/choices/probabilities/rubric bounds. Cache generations prevent an old-key request from populating a replacement key's cache. Categories may be edited before acceptance and dismissed durably by URL/category.

Ordinary mocked Chrome profiles fail closed for the Gateway hostname. HTTP interception is explicitly acknowledged before use. The interruption test uses Chrome's ServiceWorker.stopWorker and observes its stopped event; a worker-local post-restart fetch stub separately verifies key rehydration/UI recovery. These controlled tests do not claim live inference. The opt-in live runner's post-authentication stages remain unverified after the actual first-request authorization rejection.

## 0.4.0 Direct provider boundary

`lib/decision-types.ts` retains the application decision interfaces. `lib/typesafe-provider.ts` maps Boolean to Noul, normalizes the documented response and validates model IDs, complete question maps, probabilities, separate provider confidence, rubric legends, expected scores and token usage. Independently rounded scores/probabilities are validated against possible rounding intervals rather than exact recomputation. `lib/ai-service.ts` retains batching, concurrency, cache generations and feature mapping. Existing stale-response guards remain in the trusted background.

`lib/ai-settings.ts` resolves old Gateway settings safely; fresh profiles default to Direct. Separate stored fields and fixed endpoints prevent cross-provider credentials. Verification uses an isolated service instance before changing the active provider; inference rehydrates the selected key from trusted storage on every operation. Public snapshots whitelist provider/status/model/date and exclude both keys. Backups continue their explicit metadata whitelist.

The Direct live runner uses its own ignored ledger initialized with the preserved historical Vercel count. Ordinary tests block DNS for both AI hosts and mock network responses explicitly. Direct HTTP transport and worker-local mocked rehydration are distinct regression scopes; genuine live worker recovery is recorded separately. After suspension, one bounded no-retry Focus batch is reserved before sending because DevTools interception can disappear with the worker. The original metered report is retained when auditing the observed recovery call.
