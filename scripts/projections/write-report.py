"""Render the completed, saved comparison; never fits or selects a projection."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/projection-evaluation'
report = json.loads((OUT / 'report.json').read_text())
data = json.loads((OUT / 'input.json').read_text())
chosen = json.loads((OUT / 'runs' / (report['selectedRun'] + '.json')).read_text())
selected = next(c for c in report['configurations'] if c['n_neighbors'] == chosen['n_neighbors'] and c['min_dist'] == chosen['min_dist'])
pct = lambda value: f'{100 * value:.2f}%'
lines = [
    '# Offline UMAP versus PCA comparison', '',
    'This is the original comparison before the later visual spacing adjustment. The interactive map now uses UMAP only and adds bounded spacing between crowded circles. The scores below refer to the original evaluated coordinates, not the adjusted display.', '',
    report['summary'], '',
    'Contract: P-projection-v1; parent-approved AS-PROJECTION rev1. Local comparison only. The protocol and selection policy were written before fitting. All 27 prescribed runs succeeded; no additional tuning was performed. The shipped layout uses the prescribed seed 11, not the highest-scoring seed.', '',
    '| Displayed layout | Recall at 5 | Recall at 10 | Recall at 20 | Mean S |',
    '|---|---:|---:|---:|---:|',
]
for name, values in [('PCA with existing coincidence offsets', report['pcaDisplay']), ('Raw PCA (supplemental)', report['pcaRaw']), ('Selected UMAP, seed 11', chosen['metrics'])]:
    lines.append('| ' + name + ' | ' + ' | '.join(pct(values['recall'][str(k)]) for k in (5, 10, 20)) + ' | ' + pct(values['score']) + ' |')
lines += ['', 'All occupations have equal weight. The primary score measures source Jaccard neighborhood retention after display normalization and UMAP coordinate rounding to eight decimal places. It excludes self. Boundary-distance ties receive interchangeable credit only up to the remaining quota, so missing a strictly closer source neighbor still loses credit. Euclidean display-distance ties resolve by canonical occupation code. Source equality tolerance is 1e-12.', '',
    'The practical gate requires the three-seed mean S to exceed displayed PCA by at least 0.02, no lower three-seed mean recall at any k, and every seed S strictly above PCA. Only configurations with all three successful seeds can qualify. Highest qualifying mean S wins; exact ties use higher worst-seed S, then fixed grid order.', '',
    '| Neighbors | Minimum distance | Mean S | Population SD | Worst seed S | Qualifies |', '|---:|---:|---:|---:|---:|---|']
for c in report['configurations']:
    lines.append(f'| {c["n_neighbors"]} | {c["min_dist"]} | {pct(c["score"]["mean"])} | {pct(c["score"]["stdPopulation"])} | {pct(c["score"]["min"])} | {c["qualifies"]} |')
p = report['population']
lines += ['', f'The input contains {p["occupations"]} occupations and {p["dimensions"]} binary skill indicators, {p["distinctProfiles"]} distinct profiles, {p["singletonProfileOccupations"]} occupations whose profile occurs once, and {p["repeatedProfileOccupations"]} occupations sharing a profile. There are {p["emptyProfiles"]} empty skill sets and no missing binary entries. Missing source ratings are handled by the existing aggregation before binarization, not invented by this experiment. All 772 source occupations are represented.', '',
    'Two empty sets have Jaccard distance zero for the embedding metric. The neighbor panel separately defines empty-set similarity as zero and requires a shared skill; its behavior is unchanged. Identical binary profiles may separate algorithmically in UMAP; no forced collision offsets or AI-based separation were added.', '',
    '| Source population | PCA recall 5 / 10 / 20 | UMAP seed 11 recall 5 / 10 / 20 |', '|---|---|---|']
for group in ('singletonProfiles', 'repeatedProfiles'):
    lines.append('| ' + group + ' | ' + ' / '.join(pct(report['pcaDisplay']['groups'][group][str(k)]) for k in (5, 10, 20)) + ' | ' + ' / '.join(pct(chosen['metrics']['groups'][group][str(k)]) for k in (5, 10, 20)) + ' |')
lines += ['', 'Neighbor stability counts shared exact binary-profile identities as a multiset: sum of minimum counts divided by k, averaged over all occupations. This avoids penalizing exchanges between occupations with identical profiles. All 27 within-configuration seed pairs and all 12 adjacent-setting pairs at seed 11 are saved in report.json.', '',
    '| Stability comparisons | Mean at 5 | Mean at 10 | Mean at 20 |', '|---|---:|---:|---:|']
for name, values in report['stabilitySummary'].items():
    lines.append('| ' + name + ' | ' + ' | '.join(pct(values[str(k)]['mean']) for k in (5, 10, 20)) + ' |')
chosen_pairs = [r for r in report['seedStability'] if r['a'].startswith(f'n{chosen["n_neighbors"]}-d{chosen["min_dist"]:.1f}-')]
lines += ['', 'Selected-configuration seed-pair stability (mean): ' + '; '.join(f'k={k}: {pct(sum(r["overlap"][str(k)] for r in chosen_pairs) / len(chosen_pairs))}' for k in (5, 10, 20)) + '.', '',
    'Canonical top-k source graphs are symmetrized for the component diagnostic: ' + '; '.join(f'k={k}: {report["sourceKnnGraphComponents"][str(k)]["count"]} components' for k in (5, 10, 20)) + '. Ties are resolved by occupation code for this diagnostic, so it is not a tie-invariant connectivity claim. It does not affect selection.', '',
    'This is an in-sample descriptive comparison of two layouts against the same binary skill representation, not a holdout estimate or external occupational ground truth. Grid selection can favor this dataset. Seed standard deviation is descriptive, not a confidence interval. UMAP axes, cluster gaps, densities, and global distances do not establish substantive occupational or AI-risk differences. Exposure/outlook fields are absent from the canonical model input. Colors in the optional comparison plot are uniform and were created after selection.', '',
    'UMAP supports precomputed distances, and its neighborhood and minimum-distance parameters control the balance and packing of the display. See the [official parameter documentation](https://umap-learn.readthedocs.io/en/latest/parameters.html). Fixed random state and single-thread execution support repeatability; see [official reproducibility documentation](https://umap-learn.readthedocs.io/en/latest/reproducibility.html). The actual experiment pins umap-learn 0.5.4 and the versions in requirements.txt; the linked documentation may describe a newer release. The selected seed reproduced all rounded coordinates exactly on the recorded environment. Cross-version or cross-platform bitwise equality is not established.', '',
    'Reproduce from the repository root (Node dependencies and the pinned Python environment must already be installed):', '',
    '```text', 'npx tsx scripts/projections/export-input.ts', "python -m unittest discover -s scripts/projections -p 'tests*.py' -v", 'python scripts/projections/evaluate.py', 'python scripts/projections/evaluate.py --recompute', 'python scripts/projections/write-report.py', '```', '',
    'The exporter calls the application’s existing buildOccupationMap aggregation and PCA implementation. Run evaluate.py once to execute the full fixed grid plus the single selected-seed confirmation; --recompute only verifies saved coordinates, selection, metrics, report, artifact bytes and checksum without fitting. Every run stores coordinates, parameters, versions, warnings and timings. input.json contains the canonical input and both PCA baselines; protocol.json is the fixed policy; report.json stores complete metrics and stability; reproduction.json stores the confirmation coordinates. The public artifact and its pinned byte hash are generated from the selected rounded coordinates.', '',
    f'Profile SHA-256: `{data["profileSha256"]}`. Artifact SHA-256: `{report["artifactSha256"]}`.', '',
    '![Uniform-color comparison, plotted only after selection](comparison.png)', '',
]
(OUT / 'README.md').write_text('\n'.join(lines), encoding='utf-8')
fig, axes = plt.subplots(1, 2, figsize=(12, 6), constrained_layout=True)
umap_label = f'Selected UMAP ({chosen["n_neighbors"]} neighbors, min_dist {chosen["min_dist"]}, seed 11)'
for ax, points, label in zip(axes, [data['pcaDisplay'], chosen['coordinates']], ['Existing PCA display', umap_label]):
    ax.scatter([p[0] for p in points], [p[1] for p in points], s=9, c='#386477', alpha=.65, linewidths=0)
    ax.set(xlim=(0, 1), ylim=(0, 1), title=label, xticks=[], yticks=[])
    ax.set_aspect('equal')
fig.suptitle('772 occupations · skill-only geometry · uniform color', fontsize=15)
fig.savefig(OUT / 'comparison.png', dpi=160)
print('Wrote data/projection-evaluation/README.md and comparison.png')
