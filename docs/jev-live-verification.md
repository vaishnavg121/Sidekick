> Historical 0.3.0 evidence. The [0.4.0 TypeSafe Direct results](typesafe-release-candidate.md) supersede the Gateway-only blocking status; original reports remain preserved.

# Jev verification — initial 5 November 2026 campaign

**6 November follow-up:** after the credential was replaced and retry explicitly authorized, one additional verification returned HTTP 403. Campaign now halted at **2/25**, all five live workflows still BLOCKED. See [the current diagnosis and explicit resume procedure](jev-authentication-followup.md). The original findings below are historical.

**Live verification is BLOCKED by Gateway authentication.** The actual Sidekick trusted settings UI attempted one authenticated verification request using the ignored local `.env.e2e.local`. The Gateway rejected authorization; Sidekick showed its sanitized authorization error. The runner stopped, closed Chrome and removed its disposable profile. No inference request followed, no billing settings changed, and no credential was printed, captured or committed. The durable campaign ledger records **1 of 25 maximum requests used, halted**.

| Feature           | Live request                     | Authentication | Valid response  | UI                       | Accept/reject                                                      | Persist                        | Restart                                     | Result       |
| ----------------- | -------------------------------- | -------------- | --------------- | ------------------------ | ------------------------------------------------------------------ | ------------------------------ | ------------------------------------------- | ------------ |
| Connection        | 1 attempted                      | Rejected       | Not available   | Sanitized error verified | Connect attempted                                                  | No connected key retained      | Not tested                                  | BLOCKED      |
| Classification    | Not attempted after auth failure | Blocked        | Not tested live | Tested with mocks        | Tested with mocks, including manual edit/durable dismissal         | Mock-backed state verified     | Existing recovery coverage                  | BLOCKED live |
| Workspace routing | Not attempted                    | Blocked        | Not tested live | Mocked real-worker HTTP  | Real membership move/rejection with mocks                          | Verified in isolated fixtures  | Existing recovery coverage                  | BLOCKED live |
| Semantic grouping | Not attempted                    | Blocked        | Not tested live | Mocked real-worker HTTP  | Native groups with mocks                                           | Chrome groups, no new pins     | Live restart not tested                     | BLOCKED live |
| Focus Mode        | Not attempted                    | Blocked        | Not tested live | Mocked real-worker HTTP  | Evaluate/Keep/Hide/Show All                                        | Workspace preferences verified | Mocked recovery; stale response suppression | BLOCKED live |
| Cleanup           | Not attempted                    | Blocked        | Not tested live | Mocked real-worker HTTP  | Cancel leaves pages; confirmation archives/closes selected fixture | Recovery copy verified         | Live restart not tested                     | BLOCKED live |

Mock/unit results are software integration evidence, not real model quality evidence. No classification accuracy or free-form model naming claim is made. Group names are chosen from the authored topic vocabulary; Jev does not generate arbitrary names through this interface.

## Contract checked

Primary documentation: [Vercel Decision](https://vercel.com/docs/ai-gateway/modalities/decision), reviewed through BrowserOS neo. The existing integration retains `POST https://ai-gateway.vercel.sh/v1/evaluate`, `Authorization: Bearer …` and `typesafe-ai/jev`, as requested. Vercel now marks this endpoint deprecated but supported for existing integrations; new integrations use `/v1/decisions` with a different envelope. Migration is not silently mixed into this release.

Questions share sanitized state, with distinct IDs for each tab. Boolean returns a probability; Choice returns a permitted choice and option probabilities; Score returns an interpolated rubric score and rung probabilities. Sidekick validates matching IDs/types, allowed values, finite bounds, complete batches and score rungs. The six-level relevance rubric is normalized by dividing the returned score by five, not by reading an undocumented field. Selected-option probability is labeled accordingly, not presented as a generated explanation.

Requests have a 20-second timeout, at most two active requests and no automatic retries/fallback model costs. Ordinary palette search never calls AI. Large-scale tests and failure injection use mocks. Exact URL duplicates preserve queries/fragments; semantic cleanup requires explicit review and confirmation. Changed workspace/tab URL/title or superseding requests suppress stale inference before persistence.

## Repeatable opt-in runner

```powershell
# .env.e2e.local stays ignored and contains AI_GATEWAY_API_KEY.
$env:SIDEKICK_LIVE = '1'
pnpm test:live --resume --expected-used=2 --access-fixed
Remove-Item Env:SIDEKICK_LIVE
```

Without the opt-in flag the runner reports SKIPPED and performs no request. It loads the local file explicitly without public environment prefixes, uses trusted extension settings in a disposable profile, disables traces/video, caps live requests with `.output/live-jev-budget.json`, records sanitized results in `.output/live-jev-report.json` and removes the profile. Authentication/quota/billing rejection halts the campaign. The post-authentication runner paths remain unverified because the first request was rejected.

Use `--access-fixed` only after the owner has actually corrected account access following the recorded 403. A replacement credential still requires explicit `--resume --expected-used=2` but no account-correction attestation. To resume live verification, the credential owner must resolve the access issue and explicitly resume the halted campaign, retaining its used-request count. Do not reset the counter to manufacture another initial allowance. No key should be pasted into chat, GitHub, screenshots or source. No normal CI job requires a paid key.
