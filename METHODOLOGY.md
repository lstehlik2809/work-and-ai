# Methodology and limitations

## Published information and interpretation

Work & AI retrieves existing occupation-level statistics after the user confirms a match. The app does not estimate individual job loss, skills, employability, suitability, readiness or training needs. Duties vary across employers, locations and people. These U.S. estimates are not automatically representative of another country.

The BLS August 27, 2026 release combines five external measures of relative AI exposure: three relate AI capabilities to work and two map observed interactions to occupational tasks/activities. Such interactions do not establish that people employed in an occupation used AI at work. BLS normalizes inputs and imputes some missing source values. The app preserves the published Low, Moderate, High and Very high categories without converting them to numerical distances, averaging them, or filling gaps.

The categories do not distinguish assistance from automation. They are not replacement probabilities, adoption forecasts, wage effects or demonstrated productivity benefits. The theoretical evidence dates from 2020 and 2023, no later than mid-2023; usage evidence is mainly 2024–2025. A 2026 publication date does not mean current capabilities were measured. Evidence is concentrated on language models and early users of particular products. See the [BLS method](https://www.bls.gov/emp/publications/ai-exposure-categories.htm) for the upstream research and caveats.

Employment growth is projected overall percent change over 2025–2035. It has multiple determinants and is not a causal estimate of AI's effect. Projections describe a long-term path under assumptions, not observed change or a range of possible outcomes. No occupation-level confidence interval is supplied here. Annual openings include replacement needs and growth, not just net new jobs. Their original thousands-of-jobs units are converted to jobs per year, preserving published rounding.

## Classification and coverage

BLS detailed National Employment Matrix results are canonical. Inclusion uses the directory's explicit Line item designation; 281 summary rows are excluded. The official BLS O*NET-SOC 2019/NEM crosswalk supplies all joins. No title similarity or decimal-suffix rule establishes a relationship. The snapshot contains 831 BLS results and 996 O*NET relationships. Each O*NET description and selected task retains its source identity.

The app flags broader scope when multiple O*NET roles share a result, or conservatively when published titles differ after normalization. This is a presentation warning, not a mapping inference. The figures apply to the whole BLS result and are not separate specialist estimates. The [exception report](data/exceptions.json) records 249 flagged relationships, 20 unmapped O*NET occupations (Legislators and 19 military roles), and 86 mapped roles without Core tasks. All current BLS results have verified exposure; missing-value paths are tested and preserve unavailable values. See [DATA_SOURCES.md](DATA_SOURCES.md) for full provenance and independent reconciliation.

## Lexical retrieval

Case, Unicode compatibility forms, whitespace, punctuation and ampersands are normalized. Sourced short titles supply abbreviations; ambiguous aliases retain all canonical relationships. Exact official/alias matches take priority; more than three distinct results request specificity instead of hiding ambiguity. Full-title plural variants are a secondary lookup. Fuse.js handles approximate spelling, with a development maximum score of 0.24 and a 0.055 best-match window. Assistant, technician, manager, nurse and engineer distinctions must not be silently added or removed by fuzzy matching.

BM25 uses one deduplicated document per canonical occupation, built from titles, descriptions and selected tasks. Parameters are k1=1.4 and b=0.75; common function/generic work words are excluded, and a simple trailing-s term normalization is used. Ordinary responsibility retrieval requires at least two supported informative terms (IDF >1.4), at least 0.40 coverage, and at least 0.82 of the leading qualified lexical score. These small-development-set rules are not universal suitability thresholds.

## Semantic index and hybrid retrieval

The immutable encoder configuration is recorded in `src/semantic/config.json`: Xenova/all-MiniLM-L6-v2 at revision `751bff37182d3f1213fa05d7196b954e230abad9`, q8 ONNX, mean pooling, L2 normalization, 384 dimensions, 256 tokens. Transformers.js 4.2.0 uses stable ONNX Runtime Web 1.29.0, pinned through an npm override; offline CPU embedding uses ONNX Runtime 1.24.3. Browser vectors and metadata are checked before inference.

Profiles contain the BLS title, O*NET title, whole description sentences and up to three selected Core tasks per role. The builder retains only whole fragments that fit the tokenizer limit and records omitted fragments. It selects at most three evenly spaced, code-sorted, deduplicated roles per BLS result. All aliases remain in lexical retrieval rather than being stuffed into model inputs. This bounded sample cannot represent every specialist role.

Each passage is normalized. Their deduplicated mean is normalized again, producing exactly one vector per canonical occupation. Cosine retrieval therefore gives no extra maximum-score opportunities to occupations with more passages. Duplicate/ordering metamorphic tests and a first-passage ablation assess this choice; neither proves complete absence of coverage bias.

Hybrid search combines the top 50 BM25 and semantic ranks using RRF, sum(1/(60+rank)), with ranks starting at one. A candidate needs cosine >=0.38, two informative lexical terms and >=0.35 lexical coverage. After fusion, alternatives must be within 0.055 cosine of the lead and retain >=0.82 of its lexical support score. The policy was tuned only on the development fixtures. RRF, cosine, BM25 and fuzzy scores are internal retrieval evidence, not calibrated probabilities. No exposure or outlook value enters ranking.

Un-rejected exact title/alias matches remain intact in enhanced mode, including ambiguity. Explicit rejection clears the old title constraint and offers responsibilities. A confirmed selection is never silently replaced. Up to three canonical suggestions carry sourced descriptions or task excerpts for confirmation. Unsupported input receives clarification or no match, never invented duties or nearest-neighbor statistics. Long descriptions are explicitly rejected rather than silently truncated.

The architecture was informed by the owner's [second-brain repository](https://github.com/lstehlik2809/people-analytics-second-brain) at commit `57348be59b6575fc5b329650ad54dc01f87e536b`: `pipeline/build_semantic_index.mjs`, `pipeline/static/hybrid-search.mjs`, and `pipeline/static/semantic-search.html`. The implementation is original; it does not copy source code or blog content. Its unconditional semantic shortlist, character chunks, development runtime and unverified cache claims were not adopted.

## Provisional matching evaluation

Two authored sets of 20 public synthetic cases were frozen before evaluation: each has 14 matching cases (10 titles, four responsibilities), two ambiguous aliases, two clarification cases and two no-match cases. Labels were checked against source relationships but have no independent representative-user or subject-matter-expert review. They are a small provisional benchmark, not scientific validation. Fixture correction before freezing is recorded; three development runs preceded the configuration freeze. Held-out evaluation ran exactly once, with no subsequent ranking tuning.

| Held-out result | Ordinary lexical | Hybrid |
| --- | ---: | ---: |
| Top-1 acceptable, matching cases | 10/14 | 12/14 |
| Top-3 acceptable, matching cases | 11/14 | 13/14 |
| Inappropriate candidates / all presented candidates | 5/18 | 4/19 |
| Queries with inappropriate candidates / all queries | 4/20 | 3/20 |

All ten held-out title cases had acceptable hybrid top-1 results. Responsibilities achieved only 2/4 top-1 and 3/4 top-3. Both methods handled all six ambiguous/clarification/no-match states as specified. Hybrid had no paired top-1/top-3 loss or added inappropriate-query regression. The predefined material-regression rule was two or more paired losses on either matching metric, or two or more additional bad-candidate queries, regardless of gains; hard exact/ambiguity/no-match failures also blocked release.

Failures remain: H09 misses security guards in favor of a protective-service supervisor; H10 ranks industrial truck operators before heavy truck drivers; H11 adds two inappropriate alternatives to the correct plumber result. The single-passage ablation produced the same held-out aggregate counts; small multi-role groups limit conclusions about aggregation. Raw rankings, source excerpts, groups, denominators, hashes and timestamps are retained in [heldout-results.json](data/evaluation/heldout-results.json). A later provenance-only repair retains that historical report and verifies ranking equivalence separately. These results do not establish broad superiority or a measured one-minute usability outcome.
