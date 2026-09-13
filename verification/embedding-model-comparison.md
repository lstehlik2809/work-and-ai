# Embedding model comparison — 13 September 2026

Stronger embeddings helped on the tested descriptions. They did not establish a safe drop-in replacement for the complete search flow. MPNet is the most promising simple replacement in the existing hybrid ranking path; BGE is stronger in direct passage retrieval. The tested small reranker did not improve the result.

At the completion of this isolated experiment, the app's model and interface had not been changed. The subsequently authorized implementation is documented separately in [MPNet implementation verification](mpnet-implementation.md). Its current local primary responsibility search does not invoke embeddings; the existing embedding model is used by optional meaning search. All measurements below concern isolated experimental calls to that semantic machinery. Earlier local statistical/UI improvements remain separate work.

## Existing hybrid ranking, model replaced

These runs preserve the existing keyword-plus-embedding ranking logic, including numerical thresholds originally used with MiniLM. They are compatibility diagnostics, not calibrated production replacements.

| Model | Correct first match, specific cases | Acceptable match in top 5, specific cases | Both facets in top 5, explicit mixed jobs | Vague descriptions rejected |
|---|---:|---:|---:|---:|
| Current MiniLM | 22/24 | 23/24 | 0/6 | 8/8 |
| BGE-base-en-v1.5 | 24/24 | 24/24 | 1/6 | 6/8 |
| all-mpnet-base-v2 | 24/24 | 24/24 | 1/6 | 8/8 |

Both stronger models lose the previously acceptable welding result in BA-R15, which describes machining metal parts and welding components. Neither machining nor welding remains in their hybrid top five. The old hybrid result included welding but already omitted machining. Thus 24/24 first matches on the specific-case subset does not mean every description improved.

## Embeddings alone, same source text

No abstention or keyword gate is applied to these ranked lists. They diagnose retrieval; they are not complete user-facing search policies.

| Model and representation | Correct first match /24 | Acceptable in top 5 /24 | Both facets in top 5 /6 |
|---|---:|---:|---:|
| MiniLM, averaged occupation | 19 | 23 | 4 |
| MiniLM, strongest individual passage | 18 | 23 | 4 |
| BGE, averaged occupation | 22 | 24 | 5 |
| BGE, strongest individual passage | 22 | 24 | 6 |
| MPNet, averaged occupation | 19 | 24 | 5 |
| MPNet, strongest individual passage | 19 | 23 | 5 |

All six arms retrieve an acceptable occupation within 20 for every specific case. BGE individual passages recover every required mixed-job facet within five. The broad raw lists also contain designated inappropriate alternatives; their existence in the top 20 is not permission to show all of them.

A preregistered grid of 156 absolute-score-floor / maximum-distance-from-leader combinations per arm tested whether simple admission rules could preserve correct matches, reject all eight vague inputs, and satisfy the existing regression gates. None of the 936 tested configurations passed all those checks. This is a finding about this bounded policy family and development set, not proof that embeddings cannot support reliable matching.

## Reranker

The preregistered recall checks selected BGE's two representations. A pinned q8 `Xenova/ms-marco-MiniLM-L-6-v2` reranked their fixed top 20 for all 40 non-title inputs, including already-correct and vague cases. It read each query with the winning stored role passage; it could not introduce new candidates. All pairs were within the 512-token limit without truncation.

Both reranked arms produced 21/24 correct first matches, 24/24 acceptable top-five matches and 5/6 complete mixed-job matches. They therefore reduced first-match accuracy from BGE's 22/24. Neither arm had a passing configuration in its own fixed 156-setting calibration grid. Additional pair-computation time was approximately 520 ms per description at the median on this host. This is compute time summed over 20 pairs, excluding browser transport and embedding retrieval.

## Size and local performance

| Model | Model/tokenizer asset bytes, decimal MB | Warm query median | Warm query p95 |
|---|---:|---:|---:|
| MiniLM q8 | 23.7 | 6.0 ms | 7.1 ms |
| BGE-base q8 | 110.8 | 45.6 ms | 55.4 ms |
| MPNet q8 | 110.8 | 37.5 ms | 45.1 ms |

Latency workload: 40 non-title descriptions, three passes per model, one warm-up excluded, models run sequentially with one CPU inference thread, Node 24.18 on Windows. Acquisition and model initialization are excluded. These are local CPU measurements, not browser, network or phone timings. Asset sizes exclude the shared browser runtime and vector index. The reranker adds 23.9 MB of model/tokenizer assets.

## Method and limits

- All models used exactly the same 952 existing production passages across 831 canonical occupations. Broader task coverage was deliberately not introduced into this comparison.
- MiniLM and MPNet used normalized mean pooling; BGE used normalized CLS pooling and its documented retrieval prefix on queries only. Model-specific token limits were checked before inference.
- Source passage order and canonical batching match the original embedding build. Recomputed MiniLM occupation vectors reproduced the committed Float32 centroid values **with zero numerical difference**. The frozen report field named exactBytes was inferred from numerical equality, not a direct byte comparison; numerical equality is the verified claim. Dimensions, binary lengths, canonical alignment, finite values and unit norms were checked before ranking.
- The original normalized centroid function was used. Individual-passage ranking selects the highest passage similarity per canonical occupation. A centroid's nearest passage is only a retrieval aid; it does not prove that one specialty explains the centroid's score.
- The corpus has 747 occupations with one passage, 47 with two and 37 with three. Maximum-passage ranking offers more matching opportunities to occupations with more passages; per-arm lead counts by passage count are retained in the detailed results.
- The 48 cases are previously exposed development examples: 24 specific, eight mixed/ambiguous, eight vague and eight titles. Six mixed cases require two facets; two allow alternative occupational interpretations. The eight titles use the existing title lookup and are reported separately; they are not evidence of embedding improvements.
- Labels are independently agent-authored and source-grounded, not expert or representative-user validation. An unlisted alternative is unreviewed, not automatically wrong. No expectation was changed after these model results.
- Calibration used this exposed set and is optimistic. The separate 48 fresh evaluation cases remain sealed. No model or calibrated policy qualified for that final evaluation in this experiment.
- No selected-candidate browser check was run because no calibrated primary or reranked policy passed the preregistered development gates. The favorable unchanged-hybrid diagnostics still need model-appropriate calibration and separate evaluation.

## Recommendation

Keep the simple description-to-suggestions interface. Prioritize MPNet with the existing hybrid search as the next narrowly scoped candidate, because it improved the tested specific matches while preserving all tested vague-input rejections. Address the remaining mixed-job ranking regression and validate the resulting complete policy independently before replacing the app's model. Retain BGE passage retrieval as evidence that preserving individual passages can help mixed responsibilities. Do not add the tested reranker on the strength of these results.

Reproducibility files are retained in `verification/local/embedding-comparison/`: pinned model manifests, encoding/evaluation/reranker freezes, corpus and original case bytes, source/query vector caches, full rankings, calibration grids, latency samples and scripts. Source assets and previous failed experiments remain unchanged.

Independent review: PASS for the EXP-01 diagnostic and evaluator, with reporting clarifications incorporated. This is not product acceptance. The reviewer did not rerun inference or access the sealed cases.
