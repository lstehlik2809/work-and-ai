# Work & AI

Explore published relative AI exposure and employment projections for U.S. occupations. Search an English title, select skills, or describe your responsibilities, then confirm the occupation to view or compare up to three published results. This is an occupational reference, not an assessment of a person.

Each confirmed result includes an explanation of its exposure category and the dates of the underlying evidence. Optional BLS AI outlook notes retain their industry scope and full source wording; they describe staffing-share projection assumptions, not the cause of the exposure rating or total job losses. A missing note does not establish that AI has no effect.

The “Show top” control displays up to 1–10 matching occupations, defaulting to five. It applies to title, skills, and description results and updates existing suggestions immediately. Searches can return fewer than the requested number when fewer candidates meet the matching criteria; the comparison limit remains three occupations.

[Open the app](https://lstehlik2809.github.io/work-and-ai/) · [Methodology](METHODOLOGY.md) · [Data sources](DATA_SOURCES.md) · [Verification](VERIFICATION.md)

## Run locally

Use Node **24.18.0** and the committed lockfile.

```sh
npm ci
npm run dev
```

Open the displayed address at `/work-and-ai/`. To inspect production output:

```sh
npm run validate:data
npm run validate:semantic
node scripts/semantic/assets.mjs
npm run typecheck
npm test
npm run build
npm run preview
```

Normal builds use committed public data, vectors, and pinned model/runtime files. They neither contact the upstream data services nor re-embed the corpus. React, TypeScript and Vite render a static site; Fuse.js and BM25 provide ordinary retrieval. No server, accounts, analytics, fonts, inference API, or generative interpretation service is used.

## Optional meaning search

Title search is available after the lexical data loads. “Describe your work” is optional. The model, runtime and index load only after “Search by meaning.” A dedicated worker uses single-thread WebAssembly without WebGPU or cross-origin isolation. Text, query vectors and ranking stay in the browser. Links contain only public BLS codes and a release identifier; CSV contains only published records and definitions. GitHub may retain static-file access logs.

The pinned MiniLM q8 model alone is 22,972,370 bytes; the WASM runtime is 25,749,873 bytes. See the separate size and timing measurements in [VERIFICATION.md](VERIFICATION.md). The supported Transformers fetch hook bypasses the HTTP cache to avoid observed Chromium cache-writer races during overlapping discovery/loading; supported revision-keyed CacheStorage remains active. Browser CacheStorage is best effort and keyed by revision-specific local paths. Eviction or private browsing can require another download. Missing storage falls back to uncached loading. Loading errors, a two-minute timeout, incompatible metadata, cancellation and superseded queries leave ordinary search and confirmed comparisons available. Inputs exceeding 256 tokenizer tokens are rejected explicitly; the UI also limits text to 1,000 characters.

## Deliberate data and vector updates

Read [DATA_SOURCES.md](DATA_SOURCES.md) before changing the source pins. Source retrieval is optional and rejects changed upstream bytes. Python 3.10+ and openpyxl 3.1.5 are needed only for offline preparation/reconciliation.

```sh
npm run data:fetch
npm run data:prepare
python scripts/data/reconcile.py
npm run validate:data
```

Restore exact semantic assets, or verify existing ones:

```sh
node scripts/semantic/assets.mjs --fetch
node scripts/semantic/assets.mjs
```

The recipe downloads only the immutable model revision and copies the runtime from the locked npm dependency; every file must match its recorded SHA-256. Do not replace pins merely to silence a mismatch. Model/license information is in [MODEL_NOTICES.md](MODEL_NOTICES.md) and `public/semantic/assets.json`.

After reviewing a new source snapshot or deliberately changing the encoder/profile recipe:

```sh
npm run semantic:build
npm run validate:semantic
node scripts/semantic/build.mjs --check
```

The optional `--check` recomputes the corpus without replacing committed outputs and checks exact reproduction.

Build-time CPU inference uses the same quantized ONNX weights, tokenizer, 256-token boundary, mean pooling, normalization and 384 dimensions as the browser. It writes one normalized centroid per canonical occupation and a first-passage ablation index. Review omitted fragments and coverage in `public/semantic/metadata.json`, inspect mapping exceptions, run all checks and browser QA, and obtain review before publishing.

Matching fixtures, frozen hashes, development runs and the single held-out run are in `data/evaluation`. Labels are provisional authored examples, not independent expert ground truth. `npm run evaluate -- --split=dev` records a development run. The existing held-out file is deliberately write-once; do not delete it to tune repeatedly against the same labels. A future ranking change needs a new untouched evaluation set. The provenance-only correction is documented separately from frozen ranking results.

The description-matching revision has a separate source-grounded development set. Run its real local encoder checks without changing historical reports:

```sh
npx tsx scripts/evaluate-description-matching.ts data/evaluation/matching-v2-development.json verification/local/matching-v2-development-result.json
```

With a production preview running, `node scripts/description-matching-browser-check.mjs` checks the original people-analytics example, two variants, and specialist selection in Chromium. It defaults to `http://127.0.0.1:4173/work-and-ai/`; set `TEST_URL` for another preview address. These authored checks measure specific regressions, not general occupational-matching accuracy.

The [description-matching validation report](data/evaluation/matching-v2-validation.md) links all 42 cases and records paired results, four fresh occupational checks, and remaining errors. Run any fixture with the same evaluator command above; diagnostic sets intentionally exit nonzero for the disclosed misses.

## Browser verification

Playwright 1.62.1 is a development dependency. With the production preview running, run `npx playwright install chromium` once and `npm run browser:check`. Set `TEST_URL` to the deployed app root (including its trailing slash) to repeat the same suite on Pages. `OUTPUT_DIR` defaults to ignored `verification/local`; inspected release artifacts live in `verification/release`. The script saves real CSV/PDF downloads, checks privacy and user flows, tests 390-pixel layout, and runs cold/revisit/failure diagnostics. A narrow viewport uses desktop hardware; it is not a physical-phone benchmark. PDF pages also require visual inspection.

The stable `sharp` 0.35.4 override removes inherited image-library high-severity advisories; `adm-zip` 0.6.0 removes its allocation advisory. The latter still has an upstream moderate symlink-extraction advisory, confined here to the offline native-runtime installation dependency. The browser bundle contains neither package and accepts no uploaded archives or images. Do not apply an automatic force downgrade to the pinned encoder to hide audit output.

## Deployment

The project-site base is `/work-and-ai/`. GitHub Pages uses Actions as its publishing source. `.github/workflows/pages.yml` installs locked dependencies, validates committed sources/vectors/assets, typechecks, tests and builds. Only pushes to `main` or manual runs on `main` may upload/deploy `dist`; pull requests run checks without publishing. Deployment has `pages: write` and `id-token: write`, an explicit `github-pages` environment, and concurrency protection.

After deployment, verify the actual site, share-link refresh and local WASM loading under its repository path. `/diagnostics.html` is a separate verification harness with public synthetic examples, timing/resource reports and explicit fault injection; it is not linked in the user flow. Faults never modify source data. This follows the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite deployment guide](https://vite.dev/guide/static-deploy.html).

## Sources and rights

The current snapshot combines BLS 2025–2035 projections/exposure (August 27, 2026) and O*NET 31.0. See [DATA_SOURCES.md](DATA_SOURCES.md) for attribution, CC BY 4.0 terms, modifications, mapping provenance and exceptions. Model/runtime assets have their own notices. No endorsement or scientific validation of this app is claimed.

## Search by skills

The second visible search option, **Find by skills**, is a third independent matching path alongside title lookup and optional responsibility matching. Select from 35 searchable, grouped O*NET skills; suggestions update locally, with the shared Show top control (1–10), source ratings, and occupation confirmation. No model is downloaded for this path. Skill selections are not saved to URLs or CSV exports. Technology skills and proficiency assessment are outside this version.

The separate, hash-pinned O*NET 31.0 source pipeline uses `essential_skills.csv`, `transferable_skills.csv`, and `content_model_reference.csv`; it does not change the existing occupational or semantic corpus. Reproduce the committed compact artifact with `npm run skills:prepare`, verify it with `npm run validate:skills`, or deliberately reacquire the pinned raw files with `npm run skills:fetch`. Ordinary builds do not fetch data. Source hashes and acquisition timestamps are in `data/skills-source-manifest.json`. `npm test` includes raw hash and exact artifact reproduction checks. Run the focused production-browser checks with `npm run browser:skills` against the preview server (`TEST_URL` overrides its URL).

## Occupation map

The **Occupation map** view gives an overview of relative AI exposure across occupations with O*NET skill evidence. It plots all 772 eligible BLS occupations from the 831-occupation snapshot, with ordered circle sizes and colors for the four exposure categories and a distinct hollow mark for unavailable exposure. **Find on map** highlights title/code matches with dark rings while retaining other occupations as context; only the list narrows to those matches. Exposure toggles show any combination of categories. **All** restores every category; turning off the last selected category or selecting all five also returns to All. Neither interaction changes positions. The chart has no guide axes; its lines connect selected skill neighbors. The list shows higher exposure categories first and sorts alphabetically within a category.

Selecting an occupation zooms into it and its surroundings. Search automatically frames the highlighted occupation or matching group after a short pause, without selecting a result. Scroll over the graph to zoom toward the pointer; use **Reset view** to return to the full map. With keyboard focus on the map, +/− zooms and Escape clears selection. Zoomed views support background dragging and pan buttons. Double-click the background or use **Clear selection** to deselect without changing the camera or search highlights. A visible note beside the graph explains that lines represent the closest skill-profile matches, not equal exposure or a causal relationship.

Select an occupation to see its important skills and up to five exact Jaccard matches, including shared counts and skill names. **View occupation details** opens the existing occupation view for comparison and source context. The map lazy-loads the existing skills artifact and its UI, requires no model or new dependency, and makes no external-service requests. Failed loads offer a retry.

The map uses **UMAP**, with a small deterministic spacing adjustment to make crowded circles easier to distinguish. The adjustment is independent of exposure, runs once for the full population, and keeps each circle near its original position. Search, filters and zoom leave positions fixed; exact shared-skill connections still come from the underlying skill sets. The map offers a retry if its saved layout cannot load or fails validation.

The original [UMAP/PCA comparison report](data/projection-evaluation/README.md) records all 27 runs, seed stability and reproduction commands. Its 52.7% UMAP versus 30.3% PCA neighborhood scores describe the original layouts before the added spacing adjustment; they are neither predictive accuracy nor AI exposure. PCA is retained only in the offline comparison code. Both projection and visual spacing are approximate, so cluster gaps, density and global distances should not be read quantitatively. See [METHODOLOGY.md](METHODOLOGY.md#occupation-map) for the full rules. Run `npx tsx --test tests/occupation-map*.test.ts` for focused checks and `npm run browser:map` against the production preview for interactive checks. UMAP fitting is offline and adds no browser dependency or model download.
