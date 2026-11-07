# Release preparation — 0.4.0 release candidate

Prepared 7 November 2026. Classification: **release candidate for owner manual testing**, with completed automated acceptance evidence and remaining device/live-service gates in [current testing](typesafe-release-candidate.md). No store publication or payment has been performed or authorized.

## Reproduce and package

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm exec playwright test
pnpm audit
pnpm zip
```

Load `.output/chrome-mv3`, or extract `.output/sidekick-0.4.0-chrome.zip` into a dedicated folder and load that folder with Developer mode. Keep the existing extension ID/path when updating to retain user storage. Refresh old website content scripts after Reload. The 0.4.0 update adds the official TypeSafe host permission; accept Chrome's permission prompt when updating. Optional notifications remain a separate user choice.

The MV3 manifest contains no New Tab override, remote code, unsafe evaluation, cookies/history/debugger/scripting/webRequest permission or persistent background page. Options open in a trusted extension tab. Existing strict storage access and sender/window validation remain enabled.

## Draft store listing

**Name:** Sidekick

**Short description:** Organize live tabs into logical workspaces with a compact left sidebar, saved resources, a command palette and optional Jev AI.

**Single purpose:** Organize and recover Chrome tabs and saved workspace resources within the user's current browser profile.

**Detailed description:**

Sidekick brings a compact workspace sidebar to everyday Chrome browsing. Keep live pages assigned to logical workspaces, switch without closing other tabs, and find pages with a keyboard-friendly command palette. Save Favorites and Pinned resources, organize nested folders, and use Chrome bookmarks without altering their hierarchy.

Choose Hover, Hidden, custom Docked or native-panel fallback. Docking adjusts compatible pages conservatively and offers Hover on unsupported layouts. Chrome's original New Tab remains unchanged; the Sidekick dashboard is opened explicitly.

Remind yourself about a tab with snoozing, save URL sessions, keep an archive and export portable backups. Optional Jev analysis uses your own TypeSafe Direct key for reviewed categories, routing, related groups, Focus relevance and cleanup suggestions. AI is not required for ordinary browsing or search. Requests may incur provider charges.

Workspaces share this Chrome profile's cookies/accounts. Restores reopen URLs, not unsaved forms or complete page history. Physical shortcut conflicts, incognito/enterprise restrictions and complex website layouts may require manual checks. This version is a release candidate; do not market it as universally compatible or production approved.

**Category/language suggestion:** Productivity / English. Publisher must confirm the currently offered dashboard category.

## Permission justifications

| Manifest access                  | Justification for review                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| storage                          | Workspace definitions, saved resources, Library, preferences; trusted local key storage and session-only handles |
| tabs                             | Display/activate/close/reorder tabs and maintain logical ownership, navigation and URL reuse                     |
| sidePanel                        | Chrome-supported UI fallback when content injection is restricted                                                |
| bookmarks                        | Read-only tree/search/opening in the sidebar/palette                                                             |
| alarms                           | Recreate/wake durable snooze reminders under MV3 suspension                                                      |
| tabGroups                        | Create/name native groups after explicit Jev acceptance, and display existing groups                             |
| `https://api.typesafe.ai/*`      | Direct model discovery and user-enabled Jev requests with the TypeSafe key                                       |
| `https://ai-gateway.vercel.sh/*` | Explicit legacy-provider requests with the separate Gateway key                                                  |
| HTTP/HTTPS content matches       | Custom sidebar and reversible docking on ordinary pages, excluding the Web Store                                 |
| notifications (optional)         | OS reminder notification only after user grant                                                                   |

## Privacy disclosures to review

Public policy: [repository privacy page](https://github.com/vaishnavg121/Sidekick/blob/main/docs/privacy.md). Confirm this URL is live and accepted by the publisher dashboard before submission.

Disclose actual browsing-title/URL access, optional user-provided workspace/email/Focus information, local saved resources and optional selected-provider authentication. Do not select a blanket “no data access” statement. Explain that selected sanitized titles/domains, workspace names and goals go to the selected TypeSafe/legacy Vercel provider only when AI is requested, while keys are used for HTTPS authentication. No telemetry/advertising/sale of data or remotely hosted executable code is implemented. Publisher must review/certify the dashboard's current data-use checkboxes and provider terms; the repository does not certify an account on their behalf.

## Assets

- Manifest PNG icons: `public/icon/16.png`, `32.png`, `48.png`, `128.png`. The 128px artwork uses transparent padding and is also suitable for the store icon.
- Source vector: `assets/sidekick-icon.svg`.
- Actual UI captures: `docs/screenshots/master-*.png`. Store-ready dark/light/palette/settings/empty captures use a real 1280×800 viewport. Inspect each before upload; use up to five representative screenshots, not private browsing data.
- Optional promotional images: 440×280 small tile and 1400×560 marquee. These are not fabricated screenshots; prepare them only if desired. The currently checked dashboard guidance lists icon + at least one screenshot as required.

Reviewed primary references: [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [listing assets](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [image guidance](https://developer.chrome.com/docs/webstore/images), [listing quality](https://developer.chrome.com/docs/webstore/best-listing). Recheck at submission because policies/dashboard requirements can change.

## Submission gates and user actions

1. Review all PASS/BLOCKED/NOT TESTED rows in the acceptance ledger. Complete physical shortcuts/F11, OS notification delivery and a user-owned live Jev smoke test before making production claims.
2. Validate signed-in everyday sites, minimum supported Chrome, other OS/incognito/enterprise requirements that matter to your release audience.
3. Use the intended publisher account, current account verification/2-step requirements and valid support contact. Any registration fee/payment requires separate user authorization.
4. Review listing/privacy/permission declarations, screenshots and provider terms. Confirm the packaged version and checksum from the final report.
5. Upload the verified ZIP as a draft only when authorized. Publishing, paying or accepting publisher agreements has not been performed.

Do not claim Chrome Web Store approval or complete production readiness from a successful local build.

## 0.4.0 delivery notes

TypeSafe Direct is now primary and all five live workflows passed. The legacy Vercel campaign stays preserved and halted. Two separate fixed provider hosts are justified by explicit selection, with no credential forwarding or paid fallback. No runtime dependency or storage schema reset was added.

Live captures and mocked contract images are identified separately in `docs/screenshots/typesafe/`. These are development evidence; select/re-capture store-compatible assets after the owner's manual refinement pass. The original live fixture captures contain a diagnosed charset issue fixed in the runner. Do not upload them as polished store assets without review.

See [the current report](typesafe-release-candidate.md) for the final ZIP checksum, counters, complete acceptance table and limitations. No store upload, payment, auto top-up or publisher agreement was performed. The original New Tab is unchanged; same-path upgrade keeps local identity/data.

Verified local release ZIP: `.output/sidekick-0.4.0-chrome.zip`, **258,420 bytes**; SHA-256 `3ace5e90e4d8bcd2dd046c2b95f112dbb144a10c78b1d06f5f99917f83480e9a`. Static/build gate: **228 unit tests / 21 files**. Full Chrome: **48/48**, three embedded pixel comparisons; two Direct cases rerun after final badge styling. Extracted install and same-ID upgrades from 0.3.0 and 0.2.0 passed. Both local keys were privately compared without disclosure; no scan finding or dependency advisory remained. [Complete results](typesafe-release-candidate.md).
