# Improvements release — 13 September 2026

The user selected publishing the verified improvements while retaining the existing live search. The release preserves search from commit `0b165d93b8bf8626b8b0935b4018d5e7d0258f58`: MiniLM q8, revision `751bff37182d3f1213fa05d7196b954e230abad9`, 384 dimensions, 256 tokens, the same source passages, vectors and title/lexical/hybrid ranking.

The stronger MPNet model, editorial title suggestions and attempted ranking redesign are deferred. Their failures remain unresolved; no fresh matching-quality evaluation passed. The dated [MPNet report](mpnet-implementation.md) describes the unpublished `e905c00` candidate. Its original reports remain unchanged; exact model configuration, metadata, vectors and asset identities are preserved in `data/evaluation/mpnet/`.

## Retained improvements

- Precomputed skill-pattern counts and 27 sensitivity variants, explicit rated/eligible denominators, observed percentage-point differences and advanced model disclosures.
- Continuous skill-profile comparison alongside the existing Jaccard comparison, fixed map coordinates and keyboard-accessible skill filtering.
- Published figures clearly separated from specialist descriptions; manual comparisons of up to three occupations, reading briefs and complete skill CSV exports.
- Simple description entry with wording fallback, progress, cancellation, retry, manual confirmation and private-input exclusion from exports and shared links.

The statistical, source, map and export implementation is unchanged from the previously checked `e905c00` improvements. The prior independent 3,780-row count oracle and performance measurements remain applicable; final composition checks are reported separately below.

## Search preservation and packaging

`data/evaluation/live-search-parity.json` binds the production search cohort to the previous live commit. A baseline oracle was generated before restoration from the pinned old engine, using all 36 saved MiniLM descriptions and 11 title queries at limits 1–10. Checks compare full serialized outcomes, including states, ordering, role/task references and excerpts. These are preservation checks, not a new accuracy study.

Production contains the MiniLM model/tokenizer/runtime inventory of 49,486,452 bytes, plus metadata and vectors: approximately 52 MB in total. Browser caching is best effort and repeated downloads can increase actual transfer. The experimental MPNet assets are excluded from the deployment. Asset acquisition verifies every source byte before installation, and builds verify the active pinned inventory.

## Release evidence

Local validation passed: 158 tests, type checking, all data/skills/AI-context/semantic/skill-pattern checks and production build. The identity audit confirmed 21 baseline search files and 28 retained improvement/history files; all 34 distribution files were inspected, including pinned MiniLM assets and no MPNet assets. Chromium 151.0.7922.34 and WebKit 26.5 passed the semantic and improvements browser checks. Chromium retained the revision-keyed model cache; WebKit completed revisits by fetching the same-origin model again. All 35 map skill filters, keyboard selection and search close/cancellation checks passed.

The inherited MPNet browser assertion for the electrical-work query with a privacy sentinel failed. Testing that exact input on the unchanged live MiniLM app established the preserved order: 49-2095, 47-2111, 49-2022. The source-bound browser fixture records that baseline; this correction changes the preservation test, not ranking or occupational accuracy.

The [GitHub Actions workflow](https://github.com/lstehlik2809/work-and-ai/actions/workflows/pages.yml) runs the final candidate checks in Chromium, Firefox and WebKit before publication. Exact revision and completion evidence are available in its run records and the deployment history. Release readiness additionally requires independent review; live completion requires matching served assets and successful production inference, comparison and export flows.

Physical-phone, screen-reader, representative-user and occupational-expert studies remain unperformed. Browser viewport checks and authored matching cases do not replace those studies.

If recovery is necessary, revert and redeploy the complete prior bundle, including the matching model, tokenizer, index and metadata cohort. Partial model/index rollback can break compatibility checks.

## Deployment test recovery — 14 September 2026

The first production workflow stalled after logging the Chromium and Firefox check groups and was cancelled at GitHub's six-hour limit; it did not deploy. The log did not identify the exact cleanup or browser operation that stalled. The verification harness now isolates browser processes, bounds route and browser cleanup, releases held cancellation requests on failure, records each stage, and fails nonzero when a process deadline expires. A forced-hang control verifies that failure path. All existing inference, privacy, cancellation, edit, retry, cache, token-boundary and baseline-output checks remain required; no product ranking or source data changed for this correction.
