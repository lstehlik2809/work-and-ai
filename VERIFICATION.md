# Verification record

## Local search revision, September 10, 2026

The subsequent local search revision has **90/90 automated tests**, type checking and production build passing, plus eight search-UX, four description-inference and 12 full browser checks. The user's people-analytics description now returns Data Scientists first and Industrial–Organizational Psychologists second. Single-word/partial title results, visible loading/no-match feedback and a cancellable description panel are verified.

The [new validation report](data/evaluation/matching-v2-validation.md) contains 42 authored cases, including other occupations. The broad audit retains 10/14 correct first matches; four fresh cases improve from 2/4 to 3/4. Remaining errors and failed development experiments are disclosed. Historical data/model/evaluation hashes are unchanged. **This local revision has not been deployed.** The release record below describes the earlier published version.

## Earlier published release

Status on September 10, 2026: implementation, automated checks, saved CSV and paginated PDF verification, and the actual public GitHub Pages deployment passed. Matching evaluation remains provisional. Earlier browser testing used the Codex in-app browser, Chromium 152; final local and live tests used Playwright 1.62.1 / Chromium 151.0.7922.34 on Windows, Intel Core i7-9750H with 12 logical processors. Narrow-viewport tests use desktop hardware, not a physical phone or mobile CPU/network emulation.

## Automated and source checks

- Node 24.18.0: TypeScript check, Vite production build, and **69/69 tests passed**.
- Seven original BLS/O*NET sources hash-checked. A separate Python oracle reconciled all 831 canonical results, 996 source relationships, 59,752 alias tuples and selected descriptions/tasks. Thirteen concrete original-row samples are in `data/reconciliation-report.json`.
- Mutation tests reject fabricated/malformed metrics, invalid categories, summaries, broken mappings, wrong units/periods/rows and missing provenance. Separate fixtures preserve measured zero and unavailable values.
- Semantic checks validate 831 normalized finite 384-dimensional vectors, complete canonical references, tokenizer/passage caps, metadata/data/vector hashes and the encoder configuration. Thirty-six semantic/asset tests cover boundary and corruption cases.
- Seven pinned model/tokenizer/runtime assets total **49,486,452 bytes**, all SHA-256 and size checked. The restoration command is implemented; the initial assets were downloaded and verified, but the later `--fetch` restoration wrapper has not been separately exercised.
- Complete source aliases preserve unique matches and ambiguity in ordinary and enhanced modes. Published metric mutations cannot affect ranking. Duplicate passage/source/canonical representations do not change the tested rankings.
- CSV is parsed independently in tests, including embedded quotes/newlines, numeric negative growth, nulls, formula-prefix neutralization, definitions and source URLs. Share tests enforce public codes/release only, deduplication, maximum three occupations and disclosed release mismatch.
- Independent review found task-source attribution and rejection-state bugs. They were corrected. `data/evaluation/provenance-correction.json` replays all 40 recorded baseline/hybrid held-out outcomes with identical ordering/states/excerpt text; no new encoder run or ranking tuning occurred.

## Matching results

See [METHODOLOGY.md](METHODOLOGY.md) and the complete files under `data/evaluation`. The single held-out run had 20 queries, including 14 matching cases. Ordinary top-1/top-3 were **10/14 and 11/14**; hybrid **12/14 and 13/14**. Inappropriate candidates were **5/18** ordinary and **4/19** hybrid, affecting **4/20 and 3/20** queries. All six ambiguous/clarification/no-match cases met their specified behavior; no paired matching loss or material regression was observed.

The labels are authored and source-checked, not expert validation. Four responsibility cases are far too few for a broad claim: hybrid top-1 was only **2/4**, top-3 **3/4**. Security-guard, truck-driver and extra plumber-alternative failures remain in the report. Single-passage ablation had identical held-out totals. No representative-user one-minute usability study was conducted.

## Artifact sizes

Byte counts below separate raw assets from local gzip estimates (Node zlib defaults). These are reproducible file sizes, not a guarantee of the hosting server's chosen content encoding.

| Asset | Raw bytes | Local gzip bytes |
| --- | ---: | ---: |
| Initial application JS, shared + entry | 263,970 | about 82,917 |
| Occupation JSON | 1,338,849 | 219,020 |
| Complete lexical vocabulary | 4,492,943 | 522,530 |
| Semantic metadata | 767,056 | 183,636 |
| Float32 index | 1,276,416 | 1,182,464 |
| Lazy semantic worker JS | 523,176 | 149,560 |
| Quantized ONNX model | 22,972,370 | measured separately from initial JS |
| Tokenizer and configuration files | 712,802 | measured separately from initial JS |
| WASM runtime | 25,749,873 | 6,442,000 (Vite estimate) |
| Runtime module | 51,407 | separate static asset |

Vite reports about 83.8 kB gzip for initial application JS using its compression settings, below the approximate 200 kB target. Semantic model/runtime/index bytes are about 51.5 MB raw before worker/module overhead; the UI says about 52 MB. The build also emits an unused default-runtime WASM copy under `assets/`; the configured worker fetches `runtime/1.29.0/` only. Thus total deployment storage exceeds the actual semantic request inventory. No model/runtime request was observed before the meaning action.

## Local browser observations

The separately built `/diagnostics.html` runs the production worker with public synthetic examples and records Resource Timing entries, cache keys, timing and injected faults. It is not part of initial application loading. The first successful production worker run followed earlier failed path-discovery attempts, so **its 904.5 ms initialization is cache-affected and is not claimed as a cold download**. The warm second query took **58.8 ms**. A subsequent page visit at a 390×844 viewport initialized in **883.5 ms**, with a **61.8 ms** warm query. Both use the desktop device above. Repeat-visit worker resources contained only metadata, vectors and source-data validation; model/tokenizer/runtime came from the revision-keyed browser cache.

Observed worker checks: download unavailable, runtime unavailable, injected memory failure, index/config mismatch and 500 ms diagnostic timeout reject cleanly; unavailable CacheStorage still runs successfully (947 ms initialization on the narrow-viewport run). Three rapidly superseded queries produce A cancelled, B cancelled, C resolved. A 256-token input runs; 257 and 262-token inputs reject explicitly. A Unicode input with a distinguishing tail is rejected at 368 tokens, with no silent truncation.

Ordinary title search, confirmation, two-role comparison and share refresh were observed before the optional worker. Chief Sustainability Officers maps to Chief executives with a broader-statistic warning; registered nurses and pharmacists retain their published values. Keyboard Enter selects a candidate and moves focus to the result heading. Exact nurse-title rejection followed by pharmacy responsibilities produced a pharmacist suggestion while keeping the already confirmed nurse record and comparison intact until selection. The share hash contained only BLS codes and the release identifier.

The initial in-app browser could not expose saved downloads or a print dialog. After explicit user authorization, Playwright 1.62.1 / headless Chromium 151.0.7922.34 supplied the missing output path. **All 12 browser scenario groups passed**; saved files, network inventory, cold/revisit diagnostics and hashes are in [verification/release/browser-report.json](verification/release/browser-report.json).

The actual CSV download contains three canonical occupations and 13 columns, independently parsed with Python csv. The downloaded CSV after a synthetic private query is byte-identical and contains no private marker. Both the comparison and single-occupation PDFs are one A4 landscape page; Poppler renders were visually inspected and the pypdf text check confirms source URLs and projection periods. The initial three-page comparison and orphaned source lines were corrected with print-only spacing and a comparison-focused print layout. [Comparison PDF](verification/release/comparison.pdf) · [Single occupation PDF](verification/release/single-occupation.pdf).

The new browser exposed a real HTTP-cache writer race (`ERR_CACHE_WRITE_FAILURE`) during repeated model discovery/loading. The supported Transformers fetch hook now uses `cache: no-store` for its HTTP fetches while retaining the library's persistent CacheStorage cache. Fresh and unavailable-cache runs, repeat visits and ordinary-search fallback all passed after the repair. No model, index or ranking configuration changed. On desktop loopback, the final headless suite measured **2,148 ms cold initialization**, **111.1 ms first query**, **57.9 ms warm query**, and **1,042.3 ms repeat-visit initialization**. The fresh context's cache inventory was empty. Repeat-visit model/runtime assets were served from the pinned browser cache.

The 390×844 headless viewport had no whole-page horizontal overflow; the labelled table scroll region and removal control worked. This uses the named desktop hardware without mobile CPU/network throttling. It does not claim physical-device latency. No request URL/body, captured log or saved CSV included the synthetic private marker; observed network traffic consisted of same-origin static GETs, plus local blob exports.

A dependency audit after the development-browser install identified Node-only inherited advisories. Stable overrides for sharp 0.35.4 and adm-zip 0.6.0 remove the high-severity findings without changing the pinned encoder/runtime. The remaining moderate adm-zip symlink-extraction advisory affects native-runtime installation, not browser retrieval; no untrusted ZIP/image inputs are processed by this app.

## Additional cold-load and privacy observation

A fresh `http://localhost:4173` origin at 09:02:05 UTC had an empty CacheStorage inventory before inference. Ordinary pharmacist search and confirmation worked before the meaning action. Actual cold initialization was **2,215.6 ms**, first query **126.8 ms**, total **2,344.9 ms**; warm query **49.9 ms**. This is a desktop loopback measurement, not an Internet or mobile download claim. The request inventory showed full transfers of the 22,972,370-byte ONNX model and 25,749,873-byte WASM, plus the documented tokenizer/configuration/index/runtime module. Initial requests contained no semantic model/runtime/index. Revalidation entries with 300 transfer bytes were not counted as another full download.

The public synthetic privacy sentinel `WAI_PRIVACY_SENTINEL_20260910` was included in query text. It occurred in none of the recorded request URLs and none of the captured browser logs; all observed requests used the same local origin. The application export function does not receive the query or responsibilities. The subsequent headless-browser saved-export check also passed, as recorded above.

The entire print-style preview was visually inspected at a 1,010 CSS-pixel content width. It showed the confirmed result, distinct metrics, and an unclipped three-occupation table with interpretation; controls were hidden. This supports the stylesheet layout, not pagination. Narrow 390-pixel rendering uses stacked search controls and an explicitly scrollable comparison table. Vector regeneration using the current production builder reproduced every committed vector and row exactly; see `data/semantic-reproduction.json`.

## Deployment

[Public repository](https://github.com/lstehlik2809/work-and-ai) · [Live application](https://lstehlik2809.github.io/work-and-ai/) · [Successful deployment workflow](https://github.com/lstehlik2809/work-and-ai/actions/runs/34463258584).

The release-readiness-reviewed application commit is `243991e76d18b223f470d1c30b6c2bf4d2becbc5`. GitHub Actions installed locked dependencies, validated data/vectors/assets, typechecked, passed all 69 tests, built, and deployed this commit successfully. Subsequent documentation/evidence commits preserve the same application inputs. Pages uses the actual `/work-and-ai/` project subpath.

The live headless suite completed all 12 scenario groups, including ordinary search before semantic loading, keyboard confirmation, specialist scope, comparison limits/removal, share refresh and old-release warning, rejected-title refinement, private-query network/export checks, a 390-pixel layout, cold/warm/revisit matching, and blocked-model fallback. [Raw live report](verification/pages/browser-report.json), [downloaded CSV](verification/pages/comparison.csv), [printed PDF](verification/pages/comparison.pdf), and desktop/mobile/print images are committed under `verification/pages`. The live CSV is byte-identical to the inspected local CSV. The live PDF has one A4 landscape page; extracted codes, periods and source URLs passed, and its rendered page was visually inspected for clipping and legibility.

On this desktop and unthrottled Internet connection, fresh-context initialization was **85,015.8 ms**, first query **128.0 ms**, total **85,147.1 ms**. The warm query was **60.5 ms**. A repeat visit initialized in **1,020.9 ms** and queried in **137.9 ms**, with no model/runtime network transfer. These are single observations, not a speed guarantee or mobile measurement. The cold load was dominated by downloads.

Cold worker Resource Timing reported **40,746,492 transfer bytes**, excluding the worker script and ordinary app loading. That inventory includes two reported model transfers and repeated tokenizer fetches during library discovery/loading. Each model response had **16,222,259 encoded body bytes** (22,972,370 raw); the WASM response had **6,487,814 encoded body bytes** (25,749,873 raw). Do not equate the unique raw asset inventory with actual wire transfer, or multiply this single observation into a bandwidth guarantee. Initial shared JS was **83,509 encoded body bytes** on Pages; the tiny app entry is additional. No semantic assets load for ordinary title search.

The raw suite reports injected download/runtime/memory/mismatch/hang failures as clean rejections; races and all token boundaries also match expectations. Its cache-disabled diagnostic uses a **30-second test timeout**, which expired on both live runs. This recorded timeout is not counted as successful uncached inference. A separate [actual-app cache-disabled check](verification/pages/cache-unavailable-app.json), using the production **120-second timeout**, completed enhanced matching in **85,584 ms**; ordinary search worked before and afterwards, and the confirmed comparison survived. The reproducible targeted checker is [cache-check.mjs](verification/pages/cache-check.mjs). The browser runner's aggregate PASS does not itself assert every recorded fault outcome; these raw outcomes were inspected separately, with the longer actual-app check closing the cache-disabled case.

## Skills path verification (2026-09-10)

Implementation adds the second visible search option using a separate O*NET 31.0 skills artifact. In the repository root, `npm test` passed 103 tests (96 existing and 7 new), `npm run typecheck`, `npm run build`, `npm run validate:data`, `npm run validate:semantic`, and `npm run validate:skills` exited 0. Skills validation confirms 35 definitions, 910 rated roles, 86 mapped roles without ratings, 3,515 unavailable role/skill pairs, and exact reproduction from pinned raw files. Tests include source flags, invalid payloads/selections, real mechanical/programming/teaching combinations, broad-to-specific selection, statistical-field independence, unselected-skill invariance, canonical deduplication and stable 1/5/10 prefixes.

`npm run browser:skills` passed against the built app at `http://127.0.0.1:4173/work-and-ai/` in headless Chromium. Its report and mobile screenshot are under `verification/local/skills/` (ignored local evidence). Checks cover visible path order; lazy skills load with no semantic/model requests; search, selection, source-rating explanations, confirmation and comparison; 1/5/10 prefix preservation; retained confirmed state while editing; close/reopen; CSV/share input privacy; clear/reset; empty-filter feedback; bounded 390px list and no horizontal overflow; delayed title/semantic-import cancellation; 503 failure with title fallback and reopen/explicit retry; and closing during a delayed reference load without late results. The initial browser authoring run exposed overly long checkbox accessible names, corrected to explicit skill names with descriptions separately associated. A transient immediate assertion was corrected to await the observable post-render clear state. Final focused checks passed with no page errors.

This evidence establishes deterministic source-based suggestion behavior, not general occupational-fit validity or real-device mobile performance. Independent solution review passed for the local implementation endpoint. No deployment or commit was performed.


## AI result context verification (2026-09-10)

Against baseline `8546a38bbacb4405c6e7b7fde364b4f8e647d6dd`, the separate context pipeline reproduces all 935 Table 1.12 rows and selects exactly 56 explicit-AI notes for 50 canonical occupations. Offline `python scripts/data/extract-ai-context.py` ran twice with identical intermediate SHA-256 `b88f04195c6c3d3dda47eafef551887aa919e85091eed78799263e4c50b00568`. `node scripts/data/ai-context.mjs` and `npm run validate:ai-context` passed exact derivation and runtime-integrity checks (20,747-byte public artifact). Parent independent reconciliation against the original workbook and its pre-implementation oracle passed every row and source field; local evidence is `verification/local/ai-context/reconciliation.json`.

`npm test` passed 109 tests, including six new AI-context tests for source populations, explicit-term boundaries, corruption and metadata mutations, canonical identities, all four category renderings and synthetic null, optional fetch failures, and integrity verification. `npm run typecheck`, `npm run validate:skills`, and `git diff --check` passed. Parent checks of `npm run validate:data`, `npm run validate:semantic`, and `node scripts/semantic/assets.mjs` also passed; existing occupational, skills and semantic asset hashes and ranking code remain unchanged. No new dependency was added.

`npm run browser:ai-context` passed eight groups against the production preview, with report/screenshots and a single-result PDF under `verification/local/ai-context-browser/`. It verifies exact multi-note text and industry scope, all-industries labeling, present/absent transitions, matching notes across specialties, category/date/null rendering, optional delayed load and retry across A→B→C selections, clear during fetch, HTTP/malformed/integrity failure recovery, comparison/CSV/share smoke, request privacy, no semantic download, and 390px overflow. The parent independently inspected desktop/mobile layouts and all three PDF pages, confirming readable full notes and retained print caveats (`verification/local/ai-context/independent-ui/`). These are desktop Chromium checks at mobile dimensions, not physical-device measurements.

This establishes local behavior and source fidelity for AS01–AS09. Independent release-readiness review and the authorized push/Pages/live completion checks (AS10) remain separate gates. No deployment is established by these local results.
