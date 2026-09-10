"""Requirement-derived projection metrics; no UMAP import needed."""
from collections import Counter
import numpy as np

KS = (5, 10, 20)
TOL = 1e-12

def jaccard_distances(profiles):
    bits = np.asarray(profiles, dtype=np.int64)
    intersection = bits @ bits.T
    size = bits.sum(axis=1)
    union = size[:, None] + size[None, :] - intersection
    return np.divide(union - intersection, union, out=np.zeros(union.shape, dtype=float), where=union != 0)

def top_neighbors(points, codes, k):
    points = np.asarray(points, dtype=float)
    distances = ((points[:, None, :] - points[None, :, :]) ** 2).sum(axis=2)
    np.fill_diagonal(distances, np.inf)
    return np.array([np.lexsort((np.asarray(codes), row))[:k] for row in distances])

def row_recall(source_row, selected, self_index, k):
    source = np.array(source_row, copy=True)
    source[self_index] = np.inf
    threshold = np.partition(source, k - 1)[k - 1]
    strict = source < threshold - TOL
    tied = np.abs(source - threshold) <= TOL
    quota = k - int(strict.sum())
    selected = np.asarray(selected)
    if len(selected) != k or self_index in selected or len(set(selected)) != k:
        raise ValueError('Neighbors must contain k distinct non-self indices')
    return (int(strict[selected].sum()) + min(quota, int(tied[selected].sum()))) / k

def evaluate(source, points, codes, singleton, ks=KS):
    neighbors = top_neighbors(points, codes, max(ks))
    recalls, groups = {}, {'singletonProfiles': {}, 'repeatedProfiles': {}}
    for k in ks:
        rows = np.array([row_recall(source[i], neighbors[i, :k], i, k) for i in range(len(source))])
        recalls[str(k)] = float(rows.mean())
        for name, mask in [('singletonProfiles', singleton), ('repeatedProfiles', ~singleton)]:
            groups[name][str(k)] = float(rows[mask].mean()) if mask.any() else None
    return {'recall': recalls, 'score': float(np.mean(list(recalls.values()))), 'groups': groups}

def normalize(points):
    points = np.asarray(points, dtype=float)
    lower, upper = points.min(axis=0), points.max(axis=0)
    span = float((upper - lower).max())
    return np.round(0.5 + (points - (lower + upper) / 2) * (0.8 / span if span else 0), 8)

def stability(a, b, profile_ids, ks=KS):
    result = {}
    for k in ks:
        overlaps = []
        for aa, bb in zip(a[:, :k], b[:, :k]):
            ca, cb = Counter(profile_ids[i] for i in aa), Counter(profile_ids[i] for i in bb)
            overlaps.append(sum((ca & cb).values()) / k)
        result[str(k)] = float(np.mean(overlaps))
    return result
