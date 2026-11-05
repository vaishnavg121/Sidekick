# Master build — implementation and acceptance ledger

Baseline: fetched `origin/main` = `67089b4f007d745c11fb839e9e2f8ec17854a82f` (4 November 2026). Clean checkout. This ledger records evidence, not promises of production readiness.

## Audit

| Area             | Baseline finding                                                                                                                                                                      | Acceptance evidence needed                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Workspaces       | Broken runtime isolation: session types unused; select updates global metadata; tab.updateWorkspace changes window selection                                                          | Two workspaces, four live tabs, moves, independent windows, worker/reload reconciliation                                                 |
| Tabs             | List/activate/close/search work; move trusts payload window ID and ignores native constraints                                                                                         | Trusted window checks, correct Chrome indices, keyboard/menu operations                                                                  |
| Favorites/Pinned | CRUD/persistence exist; active workspace global; Pinned→Today already uses open/remove; trusted source validation incomplete                                                          | Membership-aware reuse, validated cross-workspace drops                                                                                  |
| Folders          | Validation/nesting exist; reorder UI incomplete                                                                                                                                       | Ordering, root/nesting moves, auto-expand, cycle prevention                                                                              |
| Palette          | Search/UI exist; fuzzy matching incorrect, search always outranks actions; focus/command wiring incomplete                                                                            | Dedicated ranking/action/accessibility tests and browser execution                                                                       |
| Keyboard         | Four defaults present; client drops palette focus event                                                                                                                               | Four defaults maximum, configurable extra commands, assignment view                                                                      |
| Jev/Focus        | Partial; key included in content snapshots, key not restored after worker restart; routing pins tabs, grouping pins ordinary tabs; score parser assumes undocumented normalized field | Official contract, trusted key editor, sanitized snapshots, accepted runtime operations, mocked contracts; live only with authorized key |
| Productivity     | Snooze/sessions/archive/backup missing                                                                                                                                                | Durable validation, alarms, safe restore/dedup, previewed non-destructive import                                                         |
| Sidebar          | Reversible docking and fallbacks exist                                                                                                                                                | Existing regression suite plus updated visual checks                                                                                     |
| New Tab          | Currently overridden                                                                                                                                                                  | Remove override per master request; retain dashboard as explicit extension page                                                          |
| Release          | Historical docs/tests only; debug protocol_diff.txt tracked                                                                                                                           | Updated privacy/store/release docs, package audit, honest acceptance results                                                             |

## Execution checklist

- [x] Fetch actual remote baseline and inspect architecture.
- [x] Run baseline checks and diagnose failures/timeouts.
- [x] Integrate per-window/per-tab workspace engine and lifecycle reconciliation.
- [x] Validate tab/resource/folder operations and drag destinations in background.
- [x] Complete palette, shortcuts, focus/accessibility and UI interactions.
- [x] Secure and finish optional Jev workflows using official HTTP contract; live key remains blocked.
- [x] Implement alarms-based snoozing, saved sessions, archive and backup preview/import.
- [x] Remove New Tab override; preserve explicit dashboard access.
- [x] Run meaningful unit and real loaded-extension browser acceptance tests.
- [x] Inspect screenshots and fix rendered issues; measure 200+ item performance.
- [x] Security/dependency/manifest/package audit and store submission documentation.
- [x] Commit verified implementation and release evidence; normal main merge/push verification is recorded with the final remote SHA in the completion report.
- [x] Record every final acceptance step as PASS/FAIL/BLOCKED/NOT TESTED.

## Test and release policy

Use isolated Chrome test profiles and deterministic fixtures as explicitly requested. BrowserOS tools are not connected in this session; personal browser profiles will not be used for tests. No authorized live Gateway key has been provided. Do not expose/read personal keys to manufacture a live test. No store publication or paid actions are authorized.

Session identifiers stay in `chrome.storage.session`; durable definitions and recoverable URL snapshots stay local. On a full browser restart, reconcile fresh live IDs without guessing ownership from stale numeric IDs. Membership changes never close/reload tabs. Native Chrome tab activation selects its assigned Sidekick workspace. Workspace selection restores its last active live tab or displays an empty workspace without destroying other tabs.

## Progress and diagnosed failures

- Workspace engine unit acceptance passes (four tabs, independent windows, ownership moves, lifecycle/worker re-instantiation, URL-hash restart reconciliation). Raw Chrome IDs remain session-only. Recent window fingerprints contain SHA-256 URL hashes, never raw live URLs; retain at most 20 unmatched snapshots. Ambiguous same-URL ownership falls back safely.
- Loaded-extension master tests passed workspace partition/move/no-reload/worker recovery/two windows, dashboard/palette actions, sessions/alarms/archive/import and real worker HTTP interception for Jev. Live inference remains unverified without an authorized key.
- Fixed stale programmatic activation events that could undo a newer workspace selection; Chrome manual activation still follows ownership.
- Original browser regressions had two obsolete expectations (global tabs, New Tab override) and one drag fixture that claimed a source workspace without assigning the real tab. Tests now establish real membership and assert the new required behavior.
- CDP synthetic Alt+Shift+K did not invoke Chrome's accelerator. Chrome reports the correct assigned command. Native input probe uses `scripts/native-shortcut-smoke.mjs`; Windows Computer Use app-access approval timed out. Physical accelerator dispatch is BLOCKED, not passed or disguised by a skip. Standard browser tests verify registration and palette keyboard behavior separately.
- Stress-fixture failures were diagnosed: Chromium creates an initial blank tab, and an unscoped ARIA option locator matched a hidden workspace option. Corrected baseline counting and scope to palette results; measurements recorded in testing.md.
- Screenshots were rendered and inspected. Corrected palette viewport positioning, stale workspace labels and damaged Unicode characters. Final 18-image gallery reviewed; final gate passes 127 unit and 33 browser tests with no failures/skips. Extracted ZIP installation also passes.
