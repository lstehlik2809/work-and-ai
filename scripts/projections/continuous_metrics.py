"""Continuous, pairwise-observed distances and strict promotion gates."""
import numpy as np
from scipy.sparse import csr_matrix
from metrics import KS, evaluate, normalize, top_neighbors, stability

def continuous_distances(profiles):
    values = np.asarray(profiles, dtype=float)
    known = np.isfinite(values)
    support = known.astype(int) @ known.astype(int).T
    difference = np.zeros(support.shape, dtype=float)
    for dimension in range(values.shape[1]):
        valid = known[:, dimension, None] & known[None, :, dimension]
        delta = np.abs(values[:, dimension, None] - values[None, :, dimension])
        difference += np.where(valid, delta, 0)
    source = np.full(support.shape, np.inf)
    np.divide(difference, support * 4, out=source, where=support >= 20)
    return source, support

def sparse_supported(source, maximum_neighbors):
    supported = np.isfinite(source)
    if np.any(supported.sum(axis=1) - 1 < maximum_neighbors):
        raise ValueError('Insufficient supported finite neighbors')
    rows, columns = np.nonzero(supported)
    # Construct explicitly: supported zero distances and diagonal must survive.
    return csr_matrix((source[rows, columns], (rows, columns)), shape=source.shape)

def select(configurations, baseline):
    for config in configurations:
        config['qualifies'] = (config['successfulSeeds'] == 3
            and config['score']['mean'] >= baseline['score'] + .02
            and all(config['recall'][str(k)]['mean'] >= baseline['recall'][str(k)] for k in KS)
            and config['score']['min'] > baseline['score'])
    qualifying = [config for config in configurations if config['qualifies']]
    if not qualifying:
        raise RuntimeError('No configuration passes the frozen promotion gates; no artifact promoted')
    return sorted(qualifying, key=lambda c: (-c['score']['mean'], -c['score']['min'], c['order']))[0]
