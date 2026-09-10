# Verification record

Status on September 10, 2026: implementation and local automated checks passed; deployment verification is recorded below when completed. Matching evaluation remains provisional. Browser testing uses the Codex in-app browser, Chromium 152 on Windows, Intel Core i7-9750H with 12 logical processors. Narrow-viewport tests use desktop hardware, not a physical phone or mobile CPU/network emulation.

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
| Lazy semantic worker JS | 523,128 | 149,537 |
| Quantized ONNX model | 22,972,370 | measured separately from initial JS |
| Tokenizer and configuration files | 712,802 | measured separately from initial JS |
| WASM runtime | 25,749,873 | 6,442,000 (Vite estimate) |
| Runtime module | 51,407 | separate static asset |

Vite reports about 83.8 kB gzip for initial application JS using its compression settings, below the approximate 200 kB target. Semantic model/runtime/index bytes are about 51.5 MB raw before worker/module overhead; the UI says about 52 MB. The build also emits an unused default-runtime WASM copy under `assets/`; the configured worker fetches `runtime/1.29.0/` only. Thus total deployment storage exceeds the actual semantic request inventory. No model/runtime request was observed before the meaning action.

## Local browser observations

The separately built `/diagnostics.html` runs the production worker with public synthetic examples and records Resource Timing entries, cache keys, timing and injected faults. It is not part of initial application loading. The first successful production worker run followed earlier failed path-discovery attempts, so **its 904.5 ms initialization is cache-affected and is not claimed as a cold download**. The warm second query took **58.8 ms**. A subsequent page visit at a 390×844 viewport initialized in **883.5 ms**, with a **61.8 ms** warm query. Both use the desktop device above. Repeat-visit worker resources contained only metadata, vectors and source-data validation; model/tokenizer/runtime came from the revision-keyed browser cache.

Observed worker checks: download unavailable, runtime unavailable, injected memory failure, index/config mismatch and 500 ms diagnostic timeout reject cleanly; unavailable CacheStorage still runs successfully (947 ms initialization on the narrow-viewport run). Three rapidly superseded queries produce A cancelled, B cancelled, C resolved. A 256-token input runs; 257 and 262-token inputs reject explicitly. A Unicode input with a distinguishing tail is rejected at 368 tokens, with no silent truncation.

Ordinary title search, confirmation, two-role comparison and share refresh were observed before the optional worker. Chief Sustainability Officers maps to Chief executives with a broader-statistic warning; registered nurses and pharmacists retain their published values. Keyboard Enter selects a candidate and moves focus to the result heading. Exact nurse-title rejection followed by pharmacy responsibilities produced a pharmacist suggestion while keeping the already confirmed nurse record and comparison intact until selection. The share hash contained only BLS codes and the release identifier.

The browser's CSV action was invoked and generated the app's prepared-export state, but this in-app browser did not surface a download event or saved file. CSV content is verified through the actual export function and independent parser tests; successful operating-system file saving is **not independently verified** here. Likewise the print action did not expose a print dialog. The production print CSS can be inspected through the diagnostic preview, which explicitly does **not emulate pagination**; saved PDF pagination remains unverified. These are concrete browser-tool limitations, not successful-download/PDF claims.

## Additional cold-load and privacy observation

A fresh `http://localhost:4173` origin at 09:02:05 UTC had an empty CacheStorage inventory before inference. Ordinary pharmacist search and confirmation worked before the meaning action. Actual cold initialization was **2,215.6 ms**, first query **126.8 ms**, total **2,344.9 ms**; warm query **49.9 ms**. This is a desktop loopback measurement, not an Internet or mobile download claim. The request inventory showed full transfers of the 22,972,370-byte ONNX model and 25,749,873-byte WASM, plus the documented tokenizer/configuration/index/runtime module. Initial requests contained no semantic model/runtime/index. Revalidation entries with 300 transfer bytes were not counted as another full download.

The public synthetic privacy sentinel `WAI_PRIVACY_SENTINEL_20260910` was included in query text. It occurred in none of the recorded request URLs and none of the captured browser logs; all observed requests used the same local origin. The application export function does not receive the query or responsibilities. Saved-export artifact verification remains pending the capable-browser check.

The entire print-style preview was visually inspected at a 1,010 CSS-pixel content width. It showed the confirmed result, distinct metrics, and an unclipped three-occupation table with interpretation; controls were hidden. This supports the stylesheet layout, not pagination. Narrow 390-pixel rendering uses stacked search controls and an explicitly scrollable comparison table. Vector regeneration using the current production builder reproduced every committed vector and row exactly; see `data/semantic-reproduction.json`.

## Deployment

Pending actual workflow and Pages verification at the time this record was first written. Do not infer deployment success from the workflow file or local build.
