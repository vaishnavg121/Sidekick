# Changelog

## 0.4.0 release candidate — 7 November 2026

- Make TypeSafe Direct (`jev-latest`) the default Jev provider; retain existing Vercel settings as a separate legacy provider, with no credential forwarding or automatic paid fallback.
- Add explicit Noul/Choice/Score normalization, complete runtime validation, model discovery, safe HTTP errors and provider-specific trusted credentials. Handle independently rounded score distributions observed in real inference.
- Add the official TypeSafe host permission, preserving extension identity, existing permissions and local metadata. No new runtime dependency.
- Complete real authenticated classification, routing, native grouping, Focus, cleanup, review actions, persistence, actual worker stop/recovery, disconnect and offline checks in disposable profiles. Preserve Vercel history and reconcile the combined campaign at 22/25 requests.
- Add Direct contract, credential-isolation, offline campaign-budget and real-Chrome recovery regressions. Keep existing tests and ordinary Chrome New Tab behavior.
- Prepare a verified local release candidate for owner manual testing. No store upload or publication.

## 0.3.0 beta — 6 November 2026

- Add Appearance Studio: seven presets, accessible hue/SV/hex controls, gradients with 2–5 stops, surfaces/blur/grain/shadows, spacing/motion, live preview and explicit persistence, workspace overrides and safe theme import/export.
- Preserve legacy metadata and installation identity. Appearance is additive and portable backups remap imported workspace themes without overwriting global preferences.
- Refine shared design tokens, palette opening/closing/focus, compact AI review rows, manual category editing and durable dismissals. Respect reduced motion/forced colors and bound effects for legibility.
- Fix compiled website blur: remove the vendor alias that caused the standard declaration to disappear. Zero blur uses no filter. Preserve hue/saturation intent for achromatic color editing.
- Reject malformed/partial/unexpected AI answers and invalid probability mass. Guard changed tabs/workspaces and superseding inference before persistence; isolate caches across key changes.
- Harden mocked browser networking, prove actual service-worker stop/recovery, real pointer dragging and hover focus retention, and add theme/AI security coverage and three visual baselines.
- Live Gateway verification attempted once and was rejected for authorization; the campaign stopped. Native OS key dispatch remains blocked by the computer-use URL policy. No production readiness or store publication is claimed.

## 0.2.0 beta — 5 November 2026

- Integrate live workspace membership, independent windows, last-active restoration and lifecycle/restart reconciliation. Fix trusted tab moves/reorder and delayed activation races.
- Preserve other workspaces' pages, reuse matching live tabs for saved resources and avoid duplicated session-restoration batches.
- Complete tab actions, resource/folder drag flows, folder subtree moves, keyboard alternatives and guarded empty-workspace deletion.
- Correct palette fuzzy ranking, action precedence, command delivery, focus and viewport positioning. Add configurable productivity commands and actual shortcut assignments.
- Secure optional Jev key entry/snapshots and HTTP/error handling. Apply routes to membership and groups to native Chrome groups. Persist accepted categories and workspace Focus preferences.
- Add alarm reminders, saved URL sessions, archive, validated backup preview/import copies and non-blocking onboarding.
- Remove New Tab override per the master request; retain explicit dashboard access.
- Add trusted options, icons, UI/accessibility refinements, security/release docs and expanded browser/unit coverage.
- Patch the development-only minimatch advisory through a scoped override. Add alarms/tabGroups/Gateway host access and optional notifications; no new runtime dependencies.
- Physical shortcuts, live authorized Jev and OS notification delivery remain external/manual validation items. This is a personal-use beta, not a claim of production/store approval.

## Earlier milestones

Historical M1–M1.3 reports remain in `docs/`.
