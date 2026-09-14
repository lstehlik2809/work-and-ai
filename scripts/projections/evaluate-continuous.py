"""Frozen continuous experiment; --recompute validates every saved evidence file."""
import os
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import argparse
from collections import Counter
from hashlib import sha256
from importlib.metadata import version
from itertools import product, combinations
import json
from pathlib import Path
import platform
import subprocess
import time
import warnings
import numpy as np
from continuous_metrics import continuous_distances, sparse_supported, select
from metrics import KS, evaluate, normalize, top_neighbors, stability

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/continuous-projection-evaluation'
def digest(path): return sha256(path.read_bytes()).hexdigest()
def encoded(value): return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded(value))
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def summarize(values): return {'mean': float(np.mean(values)), 'min': float(min(values)), 'max': float(max(values)), 'stdPopulation': float(np.std(values))}
def identifier(n, distance, seed): return f'n{n}-d{distance:.1f}-s{seed}'
def display(codes, coordinates):
    batch = [[{'code': code, 'x': p[0], 'y': p[1]} for code, p in zip(codes, coordinates)]]
    result = subprocess.run(['node', '--import', 'tsx', 'scripts/projections/continuous-display.ts'], cwd=ROOT,
        input=json.dumps(batch), text=True, capture_output=True, check=True)
    return json.loads(result.stdout)[0]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recompute', action='store_true')
    args = parser.parse_args()
    protocol, data = read(OUT / 'protocol.json'), read(OUT / 'input.json')
    assert json.loads(data['profileCanonical']) == data['profile']
    assert sha256(data['profileCanonical'].encode()).hexdigest() == data['profileSha256'] == protocol['profileSha256']
    assert protocol['n_neighbors'] == [15, 30, 60] and protocol['min_dist'] == [.1, .3, .5] and protocol['seeds'] == [11, 29, 47]
    for name, file in [('occupations', 'occupations.json'), ('skills', 'skills.json')]:
        assert digest(ROOT / 'public/data' / file) == data['sourceSha256'][name]
    assert digest(OUT / 'historical-umap.json') == data['baselineSha256'] == read(OUT / 'historical-pin.json')['sha256']
    codes = [row[0] for row in data['profile']['occupations']]
    profiles = [row[1:] for row in data['profile']['occupations']]
    assert codes == sorted(set(codes)) and len(codes) == 771
    assert all(len(row) == 35 and sum(v is not None for v in row) >= 20 for row in profiles)
    source, support = continuous_distances(profiles)
    sparse = sparse_supported(source, max(protocol['n_neighbors']))
    unsupported = int((~np.isfinite(source)).sum() // 2)
    minimum_neighbors = int(np.isfinite(source).sum(axis=1).min() - 1)
    assert unsupported == 15 and minimum_neighbors == 757
    identities = [tuple(row) for row in profiles]
    counts = Counter(identities)
    singleton = np.asarray([counts[row] == 1 for row in identities])
    old = read(OUT / 'historical-umap.json')
    old_display = display([p['code'] for p in old['nodes']], [[p['x'], p['y']] for p in old['nodes']])
    lookup = dict(zip([p['code'] for p in old['nodes']], old_display))
    assert data['baselineDisplay'] == [lookup[code] for code in codes]
    baseline = evaluate(source, data['baselineDisplay'], codes, singleton)
    assert abs(baseline['score'] - .1735624729788154) < 1e-14
    import umap
    versions = {name: version(name) for name in ['numpy', 'scipy', 'scikit-learn', 'umap-learn', 'numba', 'llvmlite', 'pynndescent']}
    versions.update(python=platform.python_version(), platform=platform.platform(), node=subprocess.check_output(['node', '--version'], text=True).strip())
    files = ['scripts/projections/evaluate-continuous.py', 'scripts/projections/continuous_metrics.py', 'scripts/projections/metrics.py',
        'scripts/projections/export-continuous-input.ts', 'scripts/projections/continuous-display.ts', 'scripts/projections/requirements.txt',
        'src/domain/occupation-map.ts', 'src/domain/occupation-map-continuous.ts', 'src/domain/occupation-map-spacing.ts', 'package-lock.json']
    provenance = {'profileSha256': data['profileSha256'], 'inputSha256': digest(OUT / 'input.json'), 'protocolSha256': digest(OUT / 'protocol.json'),
        'sourceSha256': data['sourceSha256'], 'baselineSha256': data['baselineSha256'], 'codeSha256': {file: digest(ROOT / file) for file in files}, 'versions': versions}
    def fit(n, distance, seed):
        parameters = {**protocol['fixed'], 'n_neighbors': n, 'min_dist': distance, 'random_state': seed}
        return normalize(umap.UMAP(**parameters).fit_transform(sparse)), parameters
    print(f'Baseline display S={baseline["score"]}; unsupported pairs={unsupported}; minimum supported neighbors={minimum_neighbors}', flush=True)
    runs, neighbor_sets = [], {}
    for n, distance, seed in product(protocol['n_neighbors'], protocol['min_dist'], protocol['seeds']):
        run_id = identifier(n, distance, seed)
        path = OUT / 'runs' / f'{run_id}.json'
        if args.recompute:
            run = read(path)
            assert run['provenance'] == provenance and [run['n_neighbors'], run['min_dist'], run['seed']] == [n, distance, seed]
        else:
            run = {'id': run_id, 'n_neighbors': n, 'min_dist': distance, 'seed': seed, 'provenance': provenance}
            start = time.perf_counter()
            try:
                with warnings.catch_warnings(record=True) as captured: points, parameters = fit(n, distance, seed)
                run.update(status='success', coordinates=points.tolist(), parameters=parameters, warnings=[str(w.message) for w in captured])
            except Exception as error: run.update(status='failed', error=f'{type(error).__name__}: {error}')
            run['seconds'] = time.perf_counter() - start
        if run['status'] == 'success':
            points = np.asarray(run['coordinates'])
            assert points.shape == (771, 2) and np.isfinite(points).all() and ((points >= 0) & (points <= 1)).all()
            spaced = display(codes, run['coordinates'])
            result, raw = evaluate(source, spaced, codes, singleton), evaluate(source, points, codes, singleton)
            if args.recompute: assert (result, raw, spaced) == (run['metrics'], run['rawMetrics'], run['displayCoordinates'])
            run.update(metrics=result, rawMetrics=raw, displayCoordinates=spaced)
            neighbor_sets[run_id] = top_neighbors(spaced, codes, max(KS))
        if not args.recompute: dump(path, run)
        runs.append(run)
        print(f'{run_id}: {run["status"]} S={run.get("metrics", {}).get("score")} ({run["seconds"]:.2f}s)', flush=True)
    configurations, seed_stability = [], []
    for order, (n, distance) in enumerate(product(protocol['n_neighbors'], protocol['min_dist'])):
        matching = [r for r in runs if r['n_neighbors'] == n and r['min_dist'] == distance and r['status'] == 'success']
        config = {'n_neighbors': n, 'min_dist': distance, 'order': order, 'successfulSeeds': len(matching)}
        if matching:
            config['score'] = summarize([r['metrics']['score'] for r in matching])
            config['recall'] = {str(k): summarize([r['metrics']['recall'][str(k)] for r in matching]) for k in KS}
        configurations.append(config)
        for a, b in combinations(matching, 2): seed_stability.append({'a': a['id'], 'b': b['id'], 'overlap': stability(neighbor_sets[a['id']], neighbor_sets[b['id']], identities)})
    try: selected = select(configurations, baseline)
    except RuntimeError:
        if not args.recompute: dump(OUT / 'rejected-report.json', {'baseline': baseline, 'configurations': configurations, 'provenance': provenance})
        raise
    selected_id = identifier(selected['n_neighbors'], selected['min_dist'], 11)
    chosen = next(r for r in runs if r['id'] == selected_id)
    if args.recompute:
        reproduction = read(OUT / 'reproduction.json')
        assert reproduction['provenance'] == provenance and reproduction['selectedRun'] == selected_id
        assert reproduction['exactRoundedCoordinateEquality'] is True and reproduction['maximumAbsoluteDifference'] == 0
        assert reproduction['coordinates'] == chosen['coordinates']
    else:
        with warnings.catch_warnings(record=True): repeated, _ = fit(selected['n_neighbors'], selected['min_dist'], 11)
        reproduction = {'selectedRun': selected_id, 'exactRoundedCoordinateEquality': bool(np.array_equal(repeated, chosen['coordinates'])),
            'maximumAbsoluteDifference': float(np.abs(repeated - np.asarray(chosen['coordinates'])).max()), 'coordinates': repeated.tolist(), 'provenance': provenance}
        dump(OUT / 'reproduction.json', reproduction)
        assert reproduction['exactRoundedCoordinateEquality'], 'Exact selected seed reproduction failed; no promotion'
    summary = f'Continuous UMAP displayed recall score {chosen["metrics"]["score"]:.1%}; historical layout {baseline["score"]:.1%}. Three-seed mean {selected["score"]["mean"]:.1%}. Passed all frozen promotion gates.'
    artifact = {'schemaVersion': 2, 'release': data['profile']['release'], 'profileSha256': data['profileSha256'], 'policy': data['profile']['policy'],
        'defaultProjection': 'umap', 'method': 'umap', 'parameters': {'n_neighbors': selected['n_neighbors'], 'min_dist': selected['min_dist'], 'n_components': 2,
        'metric': 'precomputed-continuous', 'random_state': 11, 'n_epochs': 500}, 'versions': versions,
        'evaluation': {'baseline': baseline['recall'], 'umap': chosen['metrics']['recall'], 'summary': summary},
        'nodes': [{'code': code, 'x': xy[0], 'y': xy[1]} for code, xy in zip(codes, chosen['coordinates'])]}
    artifact_bytes = encoded(artifact)
    report = {'contract': protocol['id'], 'provenance': provenance, 'population': {'occupations': len(codes), 'dimensions': 35, 'unsupportedPairs': unsupported,
        'minimumSupportedNonselfNeighbors': minimum_neighbors, 'distinctProfiles': len(counts)}, 'baselineDisplay': baseline,
        'runs': [{'id': r['id'], 'status': r['status'], 'metrics': r.get('metrics'), 'seconds': r['seconds']} for r in runs],
        'configurations': configurations, 'selectedRun': selected_id, 'seedStability': seed_stability, 'artifactSha256': sha256(artifact_bytes).hexdigest(), 'summary': summary}
    artifact_path, pin_path = ROOT / 'public/data/occupation-map-umap.json', ROOT / 'src/domain/occupation-map-umap-pin.json'
    if args.recompute:
        assert read(OUT / 'report.json') == report
        assert artifact_path.read_bytes() == artifact_bytes and read(pin_path)['sha256'] == sha256(artifact_bytes).hexdigest()
        print('PASS: all 27 runs, display coordinates, metrics, selection, report, reproduction, artifact and pin replayed.', flush=True)
    else:
        dump(OUT / 'report.json', report)
        artifact_path.write_bytes(artifact_bytes)
        dump(pin_path, {'sha256': sha256(artifact_bytes).hexdigest()})
        print('PASS: selected seed reproduced exactly; artifact promoted locally.', flush=True)
    print(summary, flush=True)

if __name__ == '__main__': main()
