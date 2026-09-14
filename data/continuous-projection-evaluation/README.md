# Continuous occupation map evaluation

Contract: PLAN-CONTINUOUS rev1 / parent-approved AS-CONTINUOUS rev1. Protocol frozen before the 27 fits. Local artifact only.

Continuous UMAP displayed recall score 39.2%; historical layout 17.4%. Three-seed mean 39.5%. Passed all frozen promotion gates.

Selected run: `n15-d0.3-s11`.

| k | Old display | Selected continuous display |
|---|---:|---:|
| 5 | 0.103501946 | 0.305317769 |
| 10 | 0.165629053 | 0.394682231 |
| 20 | 0.251556420 | 0.476134890 |

`report.json` records all configurations, gates and supplementary seed stability. Every `runs/*.json` stores raw rounded coordinates, exact TypeScript-spaced display coordinates, raw/display metrics, parameters, warnings, durations and provenance. `reproduction.json` stores a separate selected-seed fit with exact rounded equality. Its fields and coordinates are checked during replay along with all runs, metrics, report, artifact bytes and pin.

The input retains numeric values and nulls. Its fingerprint is SHA-256 over the exact canonical JavaScript serialization plus policy; `profileCanonical` avoids Python number-format differences. The exporter computes the old artifact's full 772-node spacing before restricting to the common 771. Candidate geometry is normalized and rounded8, then passed through `continuous-display.ts`, which imports the exact runtime spacing function. No Python spacing approximation or post-spacing rounding is used.

Distance is mean absolute rating difference/4 over at least20 jointly rated skills. Unsupported pairs are absent from CSR; supported zeros and diagonal are explicit. Every eligible occupation has at least757 finite nonself neighbors;15 unordered pairs are unsupported. Visual top-k is unrestricted, penalizing unsupported visual neighbors. Tie-aware recall preserves strict neighbors and grants only the available kth-boundary quota, with tolerance1e-12. Exact neighbors exclude self; visual distance ties resolve by code.

Promotion requires all3 seeds, mean score >= baseline+.02, mean recall >= baseline at each k, and every seed score > baseline. Highest qualifying mean wins, then highest worstseed, then grid order; ship seed11. No qualifying configuration means no promotion, fallback or extra tuning. This run had27 successes and9 qualifying configurations. These metrics are descriptive and in-sample; they do not establish occupational ground truth, stability across environments or predictive performance.

Reproduction from repository root (recorded Python3.10 and pinned scientific requirements):

```powershell
python -m pip install -r scripts/projections/requirements.txt
node --import tsx scripts/projections/export-continuous-input.ts
python -m unittest discover -s scripts/projections -p tests_continuous.py
python scripts/projections/evaluate-continuous.py --recompute
```

To refit the exact frozen experiment, omit `--recompute`; this replaces continuous evidence and promotes only after all gates and the exact selected-seed confirmation pass. The historical binary scripts/data remain separate in `data/projection-evaluation`. Reproduce their original execution at revision `1946660c5258b69d465d2ec7d9161f5bdbc50b10` in a separate checkout; its evaluator refuses to overwrite active schema2 output. `historical-umap.json` and `historical-pin.json` preserve the baseline bytes. Source files and Skills patterns artifacts are unchanged.

Acceptance amendment AS-CONTINUOUS rev2 changes only the inherited historical spacing test to require fewer overlapping pairs, preserving deterministic bounded spacing and every continuous evaluation gate. The frozen fit protocol and run evidence remain rev1 and unchanged.
