# MPNet development candidate — 13 September 2026

**Release is not approved.** This branch implements the requested model upgrade and accumulated application improvements for review. It is not merged into `main` and does not deploy the live Pages site. The search limitations below remain open.

## What changed

- MPNet q8 replaces MiniLM, using mean pooling, normalized 768-dimensional vectors and a 384-token query limit. Its immutable revision is `e086c5e0b3a57b0ce46dd6d9c0662948860b35f3`.
- The exact 952 tested source passages, their order, task references and 831 canonical associations are preserved in `data/semantic-passages.json`. Their original MiniLM selection budget remains recorded separately. Published figures, source releases, mappings and official aliases are unchanged.
- **Find matches** runs the existing hybrid ranking with MPNet. Wording-only suggestions appear during loading and remain in a disclosure afterward. A separate wording-only action avoids downloading the model. Confirmation, comparison, cancellation and retry remain explicit.
- The 110,086,122-byte ONNX weight is excluded from Git. `npm run semantic:fetch` acquires the immutable, SHA-256-verified assets. Each accepted file is installed atomically. Builds verify the inventory before packaging the weight into the same-origin static site.
- Earlier improvements are included: precomputed skill-pattern analysis, denominator/coverage presentation, fixed sensitivity checks, continuous skill comparisons, clearer result hierarchy, sourced discovery titles and public reading briefs.

Model/tokenizer/runtime assets total **136,599,574 bytes**. Including metadata and vectors gives **139,919,541 bytes**, about 140 MB, excluding ordinary application/data requests. This is the unique asset inventory, not a cap on transferred bytes. Browser storage is best effort; repeated weight requests were observed in WebKit, including within one initialization, and later visits may download the model again.

## Search evidence and open limitations

The [actual application evaluation](../data/evaluation/mpnet-application.json) freezes the candidate and evaluator before encoding all 48 original exposed synthetic cases. It uses the actual MPNet index and application result-limit path, records every prefix from one to ten, and validates the displayed source identities. These are authored examples, not representative-user or independent expert validation.

| Outcome | MPNet application |
|---|---:|
| Correct lead on specific descriptions | 24/24 |
| Acceptable specific result in top five | 24/24 |
| Every labelled facet in top five for explicit mixed jobs | 1/6 |
| Designated vague descriptions abstained | 8/8 |
| Previously correct specific leads lost versus MiniLM | 0 |
| Cases losing all previously acceptable top-five results | 1: BA-R15 |
| New predesignated inappropriate/critical cases on these 48 | 0 |

BA-R15 describes machining parts and welding components. MPNet's hybrid top five contains neither labelled occupation; MiniLM previously included welding. No occupation-specific correction or threshold retuning was introduced.

A separate [42-case regression report](../data/evaluation/mpnet-named-application.json) evaluates older examples with the current default limit of five and records all ten prefixes. **33/42 satisfy all their historical expectations.** The original people-analytics example now leads with Industrial-Organizational Psychologists and omits Data Scientists from the first five. Other differences include software/systems analysis, school-teaching specificity, an excluded systems-analysis alternative, and wording of abstention. Some additional alternatives fall outside historical allowed lists; those lists are not exhaustive expert judgements. All nine differing cases and exact expectations remain in the report. Logistics and the included nursing reference checks retain their expected results.

The original sealed fresh40 and fresh8 payloads are unavailable; their retained hashes cannot run an evaluation. The fresh gates—20/24 specific leads, all four complete multifacet cases, all designated abstentions and zero critical ownership/negation/scope failures—are **UNVERIFIED and release-blocking**. No replacement set was invented and no fresh-validation claim is made.

Historical MiniLM metadata, asset pins and reproduction evidence are archived separately under `data/evaluation/minilm-*`. Existing historical query fixtures retain their original bytes and results. New replay tests check reproducibility and reporting; their success does not make the quality failures pass.

## Engineering verification

- **155 unit tests passed**, including original historical replays, independent statistical fixtures, asset-corruption/retry checks, frozen-corpus/source equality, actual tokenizer boundaries and MPNet application replay.
- Typecheck, production build, occupational/semantic/skills/AI-context validators and exact skill-pattern regeneration passed.
- All 3,780 sensitivity count rows matched the independent source-aggregation oracle. A repeated five-run local comparison measured median analysis work of 2,608 ms before and 89 ms after precomputation (96.6% reduction). Browser verification was running concurrently; absolute timings are not an isolated performance benchmark.
- Full MPNet re-embedding reproduced both vector files byte for byte. Production centroids also equal the experiment's MPNet centroids byte for byte. The current vector SHA-256 is `857783f49d327e683bb8e97ea5cd154e09a2e1fb385faee7c716d15305f30b34`.
- All 952 passages fit the actual tokenizer without truncation. Browser checks accept exactly 384 tokens and reject 385 and an over-limit Unicode example.
- Actual Chromium 151.0.7922.34 and WebKit 26.5 runs exercised cold/warm inference, immediate lexical fallback, real HTTP503 download failure and retry, cancellation, worker failures, obsolete requests, manual confirmation/comparison, rejection focus, limits, private-text sentinels and 320/390-pixel layouts.
- The [browser summary](mpnet-browser-summary.json) records actual engine results, boundaries and fault outcomes. The corrected WebKit suite completed successfully; Chromium's completed checks are retained from the preceding run.
- Chromium retained the revision-keyed model cache. The Windows WebKit run had empty persistent CacheStorage and successfully re-downloaded the pinned weight on revisit. A test initially assumed universal cache retention; that assertion was corrected to the documented best-effort behavior. No caching guarantee was added.
- The accumulated application checks passed in Chromium and WebKit: comparison/brief downloads, public-link reload, skill-pattern controls/coverage/exports, corrupt-artifact recovery, continuous comparison with fixed map coordinates, narrow layouts and 200% CSS zoom. Chromium print output was checked separately.
- Firefox 153 could not launch on this Windows host because of its side-by-side runtime configuration. Linux CI installs and runs Chromium, Firefox and WebKit; configured CI is not a local Firefox PASS.

Browser timings are desktop localhost observations, not production-network, mobile-hardware or peak-memory measurements. The first diagnostic searches took roughly 8–11 seconds including initialization; warm queries were roughly 0.2–0.4 seconds. Other verification was running on the host, so these are functional observations, not a controlled performance comparison.

## Reproduction and delivery

```sh
npm ci
npm run semantic:fetch
npm run typecheck
npm test
npm run validate:data
npm run validate:semantic
npm run validate:skills
npm run validate:ai-context
npm run validate:patterns
node scripts/semantic/build.mjs --check
npm run build
npm run browser:improvements
npm run browser:mpnet
npx tsx scripts/evaluate-mpnet.ts verification/local/mpnet-recheck.json
npx tsx scripts/evaluate-description-matching.ts data/evaluation/mpnet-named-cases.json verification/local/mpnet-named-recheck.json src/search/engine.ts 5
```

The last command deliberately returns failure when historical expectations differ; retain that report rather than changing labels. Browser checks require Playwright's installed engines and can be restricted locally with `TEST_ENGINES=chromium,webkit`.

Delivery uses `codex/mpnet-app-improvements`. Branch CI builds and tests; artifact publication and deployment both retain explicit `main`-only conditions. Downloaded weights, caches and local scratch evidence are excluded from Git. Merge and live deployment require resolution or an explicit product decision on the recorded quality limitations and missing independent validation.
