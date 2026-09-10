"""Bounded offline comparison. Run from repository root; no browser dependencies."""
import argparse
from collections import Counter
from hashlib import sha256
from importlib.metadata import version
from itertools import combinations, product
import json
import os
from pathlib import Path
import platform
import time
import warnings

# Must be fixed before importing scientific libraries.
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from metrics import KS, evaluate, jaccard_distances, normalize, stability, top_neighbors

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/projection-evaluation'

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')

def digest(path):
    return sha256(path.read_bytes()).hexdigest()

def run_id(n, distance, seed):
    return f'n{n}-d{distance:.1f}-s{seed}'

def summarize(values):
    return {'mean': float(np.mean(values)), 'stdPopulation': float(np.std(values)),
            'min': float(min(values)), 'max': float(max(values))}

def select(configurations, baseline):
    for config in configurations:
        config['qualifies'] = (config['successfulSeeds'] == 3
            and config['score']['mean'] >= baseline['score'] + .02
            and all(config['recall'][str(k)]['mean'] >= baseline['recall'][str(k)] for k in KS)
            and config['score']['min'] > baseline['score'])
    successful = [c for c in configurations if c['successfulSeeds'] == 3]
    qualifying = [c for c in successful if c['qualifies']]
    if not successful:
        raise RuntimeError('No fully successful configuration; no artifact can be selected')
    return sorted(qualifying or successful, key=lambda c: (-c['score']['mean'], -c['score']['min'], c['order']))[0], bool(qualifying)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recompute', action='store_true', help='Recompute evaluation from saved coordinates without fitting')
    args = parser.parse_args()
    protocol_path, input_path = OUT / 'protocol.json', OUT / 'input.json'
    protocol = json.loads(protocol_path.read_text(encoding='utf-8'))
    data = json.loads(input_path.read_text(encoding='utf-8'))
    canonical = json.dumps(data['profile'], ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    assert sha256(canonical).hexdigest() == data['profileSha256'] == protocol['profileSha256']
    codes = [row[0] for row in data['profile']['occupations']]
    assert codes == sorted(codes) and len(codes) == len(set(codes)) == 772
    profiles = np.asarray([row[1:] for row in data['profile']['occupations']], dtype=int)
    assert profiles.shape == (772, 35) and np.isin(profiles, [0, 1]).all()
    identities = [tuple(row) for row in profiles]
    counts = Counter(identities)
    assert len(counts) == 597
    singleton = np.array([counts[p] == 1 for p in identities])
    source = jaccard_distances(profiles)
    baseline = evaluate(source, data['pcaDisplay'], codes, singleton)
    raw_pca = evaluate(source, data['pcaRaw'], codes, singleton)
    # Input and protocol validation deliberately precede UMAP import.
    import umap
    versions = {name: version(name) for name in ['numpy', 'scipy', 'scikit-learn', 'umap-learn', 'numba', 'llvmlite', 'pynndescent', 'matplotlib']}
    versions['python'] = platform.python_version()
    versions['platform'] = platform.platform()
    provenance = {'profileSha256': data['profileSha256'], 'inputSha256': digest(input_path),
                  'protocolSha256': digest(protocol_path), 'sourceSha256': data['sourceSha256'], 'versions': versions}
    all_runs, neighbor_sets = [], {}
    print(f'PCA display S={baseline["score"]:.9f}; recalls={baseline["recall"]}', flush=True)

    def fit(n, distance, seed):
        parameters = {**protocol['fixed'], 'n_neighbors': n, 'min_dist': distance, 'random_state': seed}
        model = umap.UMAP(**parameters)
        return normalize(model.fit_transform(source)), parameters

    for n, distance, seed in product(protocol['n_neighbors'], protocol['min_dist'], protocol['seeds']):
        identifier = run_id(n, distance, seed)
        path = OUT / 'runs' / f'{identifier}.json'
        if args.recompute:
            run = json.loads(path.read_text(encoding='utf-8'))
            assert run['provenance'] == provenance
        else:
            run = {'id': identifier, 'n_neighbors': n, 'min_dist': distance, 'seed': seed, 'provenance': provenance}
            started = time.perf_counter()
            try:
                with warnings.catch_warnings(record=True) as captured:
                    points, parameters = fit(n, distance, seed)
                run.update(status='success', coordinates=points.tolist(), parameters=parameters,
                           warnings=[str(w.message) for w in captured])
            except Exception as error:
                run.update(status='failed', error=f'{type(error).__name__}: {error}')
            run['seconds'] = time.perf_counter() - started
        if run['status'] == 'success':
            points = np.asarray(run['coordinates'])
            assert points.shape == (772, 2) and np.isfinite(points).all() and ((points >= 0) & (points <= 1)).all()
            result = evaluate(source, points, codes, singleton)
            if args.recompute:
                assert result == run['metrics'], f'{identifier}: stored metric mismatch'
            run['metrics'] = result
            neighbor_sets[identifier] = top_neighbors(points, codes, max(KS))
        if not args.recompute:
            dump(path, run)
        all_runs.append(run)
        print(f'{identifier}: {run["status"]} S={run.get("metrics", {}).get("score")} ({run["seconds"]:.2f}s)', flush=True)

    configurations, seed_stability = [], []
    for order, (n, distance) in enumerate(product(protocol['n_neighbors'], protocol['min_dist'])):
        matching = [r for r in all_runs if r['n_neighbors'] == n and r['min_dist'] == distance and r['status'] == 'success']
        config = {'n_neighbors': n, 'min_dist': distance, 'order': order, 'successfulSeeds': len(matching)}
        if matching:
            config['score'] = summarize([r['metrics']['score'] for r in matching])
            config['recall'] = {str(k): summarize([r['metrics']['recall'][str(k)] for r in matching]) for k in KS}
        for a, b in combinations(matching, 2):
            seed_stability.append({'a': a['id'], 'b': b['id'], 'overlap': stability(neighbor_sets[a['id']], neighbor_sets[b['id']], identities)})
        configurations.append(config)
    selected, qualifies = select(configurations, baseline)
    selected_id = run_id(selected['n_neighbors'], selected['min_dist'], 11)
    chosen = next(r for r in all_runs if r['id'] == selected_id)
    adjacency = []
    for a, b in combinations(configurations, 2):
        n_adjacent = a['min_dist'] == b['min_dist'] and abs(protocol['n_neighbors'].index(a['n_neighbors']) - protocol['n_neighbors'].index(b['n_neighbors'])) == 1
        d_adjacent = a['n_neighbors'] == b['n_neighbors'] and abs(protocol['min_dist'].index(a['min_dist']) - protocol['min_dist'].index(b['min_dist'])) == 1
        aa, bb = run_id(a['n_neighbors'], a['min_dist'], 11), run_id(b['n_neighbors'], b['min_dist'], 11)
        if (n_adjacent or d_adjacent) and aa in neighbor_sets and bb in neighbor_sets:
            adjacency.append({'a': aa, 'b': bb, 'overlap': stability(neighbor_sets[aa], neighbor_sets[bb], identities)})
    graph_components = {}
    source_no_self = source.copy()
    np.fill_diagonal(source_no_self, np.inf)
    for k in KS:
        neighbors = np.array([np.lexsort((np.asarray(codes), row))[:k] for row in source_no_self])
        graph = np.zeros(source.shape, dtype=bool)
        graph[np.arange(len(codes))[:, None], neighbors] = True
        component_count, labels = connected_components(csr_matrix(graph | graph.T), directed=False)
        graph_components[str(k)] = {'count': int(component_count), 'sizes': sorted(Counter(labels).values(), reverse=True)}
    summary = f'UMAP selected seed 11: tie-aware mean recall {chosen["metrics"]["score"]:.1%}; displayed PCA {baseline["score"]:.1%}. Configuration mean across three seeds {selected["score"]["mean"]:.1%}. '
    summary += 'Passed the predefined improvement gate.' if qualifies else 'Did not pass the predefined improvement gate; PCA remains default.'
    artifact = {'schemaVersion': 1, 'release': data['profile']['release'], 'profileSha256': data['profileSha256'],
        'defaultProjection': 'umap' if qualifies else 'pca', 'method': 'umap',
        'parameters': {'n_neighbors': selected['n_neighbors'], 'min_dist': selected['min_dist'], 'n_components': 2,
                       'metric': 'precomputed-jaccard', 'random_state': 11, 'n_epochs': 500},
        'versions': versions, 'evaluation': {'pca': baseline['recall'], 'umap': chosen['metrics']['recall'], 'summary': summary},
        'nodes': [{'code': code, 'x': xy[0], 'y': xy[1]} for code, xy in zip(codes, chosen['coordinates'])]}
    artifact_path = ROOT / 'public/data/occupation-map-umap.json'
    artifact_bytes = (json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    if args.recompute:
        assert artifact_path.read_bytes() == artifact_bytes, 'Artifact differs from independently recomputed selection/metrics'
        assert json.loads((ROOT / 'src/domain/occupation-map-umap-pin.json').read_text())['sha256'] == sha256(artifact_bytes).hexdigest()
    else:
        artifact_path.write_bytes(artifact_bytes)
        dump(ROOT / 'src/domain/occupation-map-umap-pin.json', {'sha256': digest(artifact_path)})
    report = {'contract': protocol['id'], 'provenance': provenance, 'population': {'occupations': len(codes), 'dimensions': 35,
        'distinctProfiles': len(counts), 'singletonProfileOccupations': int(singleton.sum()), 'repeatedProfileOccupations': int((~singleton).sum()),
        'emptyProfiles': int((profiles.sum(axis=1) == 0).sum()), 'missingBinaryEntries': 0},
        'pcaDisplay': baseline, 'pcaRaw': raw_pca, 'pcaExplainedVariance': data['pcaExplainedVariance'],
        'runs': [{'id': r['id'], 'status': r['status'], 'metrics': r.get('metrics'), 'seconds': r['seconds']} for r in all_runs],
        'configurations': configurations, 'selectedRun': selected_id, 'defaultProjection': artifact['defaultProjection'],
        'seedStability': seed_stability, 'adjacentSettingStability': adjacency,
        'stabilitySummary': {name: {str(k): summarize([r['overlap'][str(k)] for r in rows]) for k in KS} for name, rows in [('seedPairs', seed_stability), ('adjacentSettings', adjacency)]},
        'sourceKnnGraphComponents': graph_components, 'artifactSha256': sha256(artifact_bytes).hexdigest(), 'summary': summary}
    if args.recompute:
        assert json.loads((OUT / 'report.json').read_text(encoding='utf-8')) == report, 'Stored report mismatch'
        print('PASS: all saved coordinates, metrics, selection, report, artifact bytes and pin recomputed.', flush=True)
    else:
        dump(OUT / 'report.json', report)
        with warnings.catch_warnings(record=True):
            repeated, _ = fit(selected['n_neighbors'], selected['min_dist'], 11)
        confirmation = {'selectedRun': selected_id, 'exactRoundedCoordinateEquality': bool(np.array_equal(repeated, chosen['coordinates'])),
                        'maximumAbsoluteDifference': float(np.abs(repeated - np.asarray(chosen['coordinates'])).max()), 'coordinates': repeated.tolist(), 'provenance': provenance}
        dump(OUT / 'reproduction.json', confirmation)
        assert confirmation['exactRoundedCoordinateEquality'], 'Selected run failed exact reproduction'
        print('PASS: selected seed reproduced exactly after rounding.', flush=True)
    print(summary, flush=True)

if __name__ == '__main__':
    main()
