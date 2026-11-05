# Final polish execution ledger — 6 November 2026

Baseline: fetched clean `origin/main` `ec6b73dd50a58f246a39519142648005d676edad`. Branch `codex/final-polish`, version 0.3.0 beta. Preserve user data/IDs and original Chrome New Tab. No new runtime dependency/permission or store publication.

| Work                                                             | Implemented | Tested                                                                                           | Visual review                           | Completion                                   |
| ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------- |
| Baseline audit                                                   | Complete    | 127 units / 33 Chrome cases before changes                                                       | Baseline inspected                      | Complete                                     |
| Opt-in live Jev runner, 25-request cap                           | Complete    | One actual authorization rejection; stopped at 1/25                                              | No credential captures                  | BLOCKED live                                 |
| Strict AI contracts/cache/freshness guards                       | Complete    | Units and mocked UI/state checks pass                                                            | Compact rows inspected                  | Complete software; live blocked              |
| Tokens/sidebar/palette/AI category editing and durable dismissal | Complete    | Keyboard/ARIA/actions pass                                                                       | Review/fix pass                         | Complete                                     |
| Appearance Studio and global/workspace portability               | Complete    | All controls, no-write preview, persistence/import/export; achromatic keyboard cases checked     | Presets/gradients/studio inspected      | Complete                                     |
| Hover/drag/folders/motion                                        | Complete    | Real pointer drop, focus hold, 800ms cancellation, 16px website blur and dock restoration passed | Website captures inspected              | Complete                                     |
| Regression matrix                                                | Complete    | 177 units; final 46/46 Chrome pass after diagnosing a prior headed timeout                       | Three pixel baselines; gallery reviewed | Complete: final 46/46 pass                   |
| Security/performance/upgrade/package                             | Complete    | Secret comparison, zero audit findings, same-ID 0.2→0.3 upgrade and extracted ZIP install passed | Fixture-only screenshots                | Complete: final ZIP install and upgrade pass |
| Docs and main delivery                                           | Complete    | Verified remote/account/author; source, tests, docs and safe screenshots committed and pushed    | N/A                                     | Complete; immutable SHA in delivery reply    |

## Diagnoses

- Initial visuals exposed oversized AI cards, unstyled Library inputs and foregrounds transitioning out of sync with light backgrounds. Compact rows, explicit fields, synchronized colors and stable captures address these.
- The optimizer discarded the standard backdrop-filter when a vendor alias followed it. Keep the standard property with validated tokens. Website blur verifies 16px; zero blur uses none.
- HSV loses hue at white/black and saturation at zero brightness. Retain editor intent without changing stored theme shape.
- Reject partial/unexpected answers and invalid probability mass; suppress changed/closed/navigated or superseded inference before persistence. Cache generations isolate key changes.
- Register closed-root test selectors before launch; observe actual ServiceWorker.stopWorker instead of assuming Target.closeTarget creates a new worker object. Mocked profiles block Gateway DNS and acknowledge interception. Post-restart worker-local fetch stubbing tests key rehydration separately from HTTP transport.
- Real local-key connection was rejected; campaign halted at one request. No further live calls in this run.
- Native Computer Use stopped because browser URL confidence was insufficient for policy enforcement. No OS key was sent; the bounded fixture cleaned up. Physical keys remain BLOCKED.
- One later headed docking run timed out after an earlier full 46-case pass. Added cycle diagnostics and rerun without changing timeouts, removing assertions or skipping cases.

Remaining gates: authorized live inference, physical shortcuts/F11, OS notifications, signed-in sites, minimum Chrome/other OS/incognito/enterprise and formal screen-reader/WCAG audit. Frame drops, React rerender counts and total browser RAM were not measured. Current latency and renderer heap evidence are recorded in the results.

Final sealed-source gate: `pnpm check` passed (177 tests/18 files), Chrome 46/46 passed in 3.8 minutes, three pixel comparisons passed. Fresh extracted ZIP install, same-ID 0.2→0.3 upgrade and private credential comparison passed. Exact package checksum, 40-step ledger, measured performance and limitations are in [the final results](final-polish-results.md).
