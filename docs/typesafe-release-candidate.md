# Sidekick 0.4.0 release candidate — 7 November 2026

**Release candidate for the owner's manual testing.** TypeSafe Direct authentication and all five Jev workflows passed with genuine authenticated responses through the extension UI and trusted background. No Chrome Web Store upload/publication, payment or account-policy change was performed. This is not a universal compatibility or production certification.

Baseline was clean fetched main `deca7d91d3bbcf3c101c894e441e3d58dfd561d3`, including the Gateway resume safeguards after the earlier 0.3.0 build. Fresh baseline: **187 unit tests / 19 files and 46 real-Chrome scenarios passed**. Original tests were retained; legacy Gateway fixtures explicitly select their provider and use synthetic `vck_` keys.

## Genuine live results

All live browser data consisted of authored synthetic fixtures in disposable profiles. Real API responses were not substituted with mocks. `jev-latest` resolved to **jev-1.14.0**. Every observed Direct HTTP response was 200. The recovery call lost DevTools interception but returned a fresh schema-validated result through the same fixed Direct background path; its exact HTTP status and usage were not captured separately.

| Acceptance item                      | Result | Genuine evidence / limits                                                                                                                                                                                                                                     |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct authentication                | PASS   | Models discovery plus Noul verification through trusted Settings; model alias available, numeric Noul parsed; Connected and resolved model shown                                                                                                              |
| Classification                       | PASS   | Fourteen separately mapped tabs covering development, documentation, research, entertainment, shopping, communication and productivity; allowed categories/probabilities; accept, manual edit and durable dismissal                                           |
| Routing                              | PASS   | Real destination IDs and UI recommendations; rejected recommendation preserved membership; accepted move changed actual membership; Chrome IDs unchanged and surviving fixture load tokens unchanged                                                          |
| Semantic grouping                    | PASS   | Real React and other topic recommendations; accept created a native group, rejection preserved group assignments; no new pinned shortcuts; native group records survived worker stop                                                                          |
| Focus Mode                           | PASS   | Real fourteen-tab expected scores, correct `/5` normalization; hidden session IDs matched the real score threshold; Keep/Hide, Show All and Exit worked without closing tabs; workspace-specific state                                                        |
| Cleanup                              | PASS   | Real semantic recommendations plus separately identified local exact-URL duplicate; cancel preserved all pages, confirmation archived/closed selected fixture targets, archive restoration worked; cross-workspace duplicate and foreign window stayed intact |
| UI accept/reject/edit                | PASS   | Real review controls were operated; model probabilities shown as selected-option probability, not invented reasoning                                                                                                                                          |
| Persistence                          | PASS   | Categories, dismissals, routing rejection and Focus preferences survived reload/actual worker stop; membership map and native groups were checked                                                                                                             |
| MV3 worker restart / key rehydration | PASS   | Chrome's stopped lifecycle event observed; page reload, retained data, a new underwater goal and a fresh near-zero relevance result via real Direct inference; one missed meter event reconciled as described below                                           |
| Browser reload                       | PASS   | Live dashboard reload after worker stop; full isolated browser-exit/relaunch is additionally covered with a synthetic local mock, not claimed as another live API run                                                                                         |
| API-key isolation                    | PASS   | No credential in public snapshot or backup; disconnect removed the Direct key; live profile removed; selected-provider boundaries separately tested without live key misuse                                                                                   |
| Offline functionality                | PASS   | After disconnect and network-offline, workspace UI and local palette remained usable; full regression also covers offline resources/metadata                                                                                                                  |

Model quality is not integration correctness. The synthetic classification run returned the expected broad categories. Group topics can vary (some reference pages were grouped as Documentation instead of React). Cleanup marked meaningful query variants and similar titles as semantic duplicates. Those are potential false positives requiring manual review; they do not establish exact URL identity. The local exact-duplicate detector preserves queries/fragments, and no semantic recommendation closes a tab without explicit confirmation. Recovery restores URL/title copies, not unsaved forms or full page state.

## Requests, usage and budget audit

The old Vercel ledger/report were preserved unchanged at **2 requests, halted after HTTP 403**. Direct uses its own ledger initialized from that history, with the stricter combined maximum of 25. No rejected Gateway credential was reused or retried.

| Direct run                | Requests  | Outcome                                                                                                               |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Authentication-only       | 2         | Discovery + one valid Noul                                                                                            |
| First full pass           | 7         | Real classification/group review passed; strict score consistency rejected independently rounded Focus numbers        |
| Targeted Focus diagnostic | 3         | Discovery + Noul + Focus; retained only safe numeric distributions and rubric-match flags, proving the rounding cause |
| Completed full pass       | 8         | Five real workflows, actions/recovery/security/offline; 7 metered calls plus 1 observed post-restart batch            |
| **Direct total**          | **20**    | **4 model-discovery GETs and 16 inference POSTs**                                                                     |
| **Combined total**        | **22/25** | **20 Direct + 2 historical Vercel; three remain, no additional calls planned**                                        |

Known reported Direct usage totals **38,551 input tokens and 16,424 output tokens**, excluding the one recovery call whose usage was not intercepted. No exact currency cost was returned/captured; no price from Vercel is applied to the owner's Direct purchase.

The completed full pass's original meter report counted 7 requests because DevTools Fetch interception disappeared across suspension. A fresh page, newly submitted underwater goal and validated changed relevance established one new no-retry Focus batch (under 20 managed tabs). That call was added to the campaign audit, producing 8 for that pass and 22 combined. The original metered report was retained locally rather than overwritten. No additional API request occurred during reconciliation. The runner now reserves that single bounded recovery request before sending and checks a fresh result plus saved new goal. Post-authentication future runner variants are not represented as rerun live after this counter correction.

## Validation and security

- Final unit gate: **228 tests / 21 files passed**, including 41 additions to the fetched 187 baseline. New coverage includes Direct schemas/rounding, provider separation and the actual runner's offline campaign preflight.
- Full Chrome gate: **48 passed, 0 failed, 0 skipped** in 3.8 minutes (42 headless + 6 headed). Original 46 cases are retained; two Direct cases add normalized HTTP transport, trusted credential storage, invalid response atomicity, browser-exit/relaunch rehydration and cross-provider rejection before transport.
- Three existing pixel comparisons remain separate assertions inside the Chrome count, not additional scenarios. Ordinary tests block DNS for both AI hosts and use synthetic credentials; they do not prove model quality.
- TypeScript, ESLint, Prettier and production build passed. No new runtime dependency. The only host addition is `https://api.typesafe.ai/*`; the existing Gateway host remains for explicit legacy selection. Other permissions and original Chrome New Tab remain intact.
- Actual live-key comparisons scan tracked/untracked deliverables, logs, production output and extracted package without printing either key. Public snapshots and backups exclude both credential fields. Authenticated traces/video and browser profiles are not committed.
- Fresh extracted-ZIP installation passed. Same-path upgrades from **0.3.0 and 0.2.0** passed, preserving identity, exact workspace/Favorite/pinned/folder/preference/session/archive/snooze metadata and the dormant legacy Gateway key. Dependency audit reported zero advisories. Final private comparisons found neither local key in deliverables or the extracted bundle.

The round-trip HTTP tests and post-relaunch worker-local mock are intentionally distinguished: the mock asserts the correctly rehydrated Direct Authorization value without contacting a provider. Genuine live recovery uses no mock.

## Visual and performance review

The seven actual live captures show Connected/resolved model, review panels, relevance, cleanup, routing and recovery. They contain synthetic fixtures only. Inspection found run-together status text (fixed with explicit spacing) and mojibake in fixture titles caused by a missing UTF-8 response charset. The fixture server now declares UTF-8; original live images remain historical evidence of that test-fixture defect, not fabricated corrected captures. Later contract screenshots are labeled as mocked evidence. No human usability certification is claimed.

The full regression uses the existing 10/50/100/210-tab local-search benchmark, custom gradient, requested opacity/grain and computed 12px blur. Compared with the fresh 0.3 baseline, filter/palette milliseconds were: 10 tabs **46/25 → 47/15**, 50 **24/46 → 9/24**, 100 **17/49 → 15/36**, and 210 **24/43 → 11/25**. The renderer sample was **11,804,108 JS heap bytes**, 6,837 nodes and four documents (baseline sample 16,651,284 bytes). Palette code was not optimized in this migration; these single-run differences are not causal speed/memory improvement claims. These are individual automation runs on synthetic tabs, not statistical guarantees or heavyweight-site RAM benchmarks. Frame drops, React rerender counts and whole-browser RAM remain unmeasured.

## Release, delivery and manual testing

The package is `0.4.0`, version name `0.4.0 release candidate`. [Setup](typesafe-direct.md), [privacy](privacy.md), [architecture](architecture.md), [release/store preparation](release.md) and [changelog](../CHANGELOG.md) are updated. Final verified package: **`.output/sidekick-0.4.0-chrome.zip`**, **258,420 bytes**, SHA-256 **`3ace5e90e4d8bcd2dd046c2b95f112dbb144a10c78b1d06f5f99917f83480e9a`**. The extracted package loaded in Chrome 156.0.8078.4, created a workspace, opened the palette, preserved original New Tab and produced no owned-page errors. [Sanitized structured live evidence](typesafe-live-evidence.json).

Keep the existing unpacked installation folder/extension ID when updating. Accept Chrome's new TypeSafe host permission if prompted, then refresh existing website tabs. Avoid uninstalling/clearing storage. Enter the Direct key in secure Settings and use the extension normally for the requested manual feedback pass. Source/tests/docs/safe captures are delivered to main; the final reply records the verified immutable GitHub SHA.

Remaining manual scope: physical shortcuts/F11 on the owner's device, OS notification delivery, signed-in everyday Gmail/Drive/Google pages, minimum Chrome 116, other operating systems, incognito/enterprise policies and formal screen-reader/WCAG certification are **NOT TESTED** in this Direct migration. Existing docking fallbacks and URL-only restore limits remain. The next step is owner manual testing, followed by targeted fixes; no automatic store publication.

After the full 48-case gate, the final connection badge received a small spacing/contrast polish. The two Direct Chrome cases passed again against that final bundle (22.8 seconds), with four clearly labeled mocked contract screenshots; the final unit/static/build gate remained 228/21. No extra live request was made for this cosmetic refinement.
