import unittest
import numpy as np
from continuous_metrics import continuous_distances, sparse_supported, select
from metrics import row_recall, evaluate

class ContinuousContract(unittest.TestCase):
    def test_support_extremes_missing_and_same_binary_set(self):
        profiles = [[1]*35, [5]*35, [1]*20+[None]*15, [1]*19+[None]*16, [2]*35, [2.9]*35]
        d, support = continuous_distances(profiles)
        self.assertEqual(d[0, 1], 1)
        self.assertEqual(d[0, 2], 0)
        self.assertEqual(support[0, 2], 20)
        self.assertTrue(np.isinf(d[0, 3]))
        self.assertAlmostEqual(d[4, 5], .225)
        self.assertEqual(d[0, 0], 0)

    def test_sparse_supported_zero_and_absence(self):
        d = np.array([[0, 0, .1, np.inf], [0, 0, .2, .3], [.1, .2, 0, .4], [np.inf, .3, .4, 0]])
        sparse = sparse_supported(d, 2)
        self.assertEqual(sparse.nnz, 14)
        self.assertIn(1, sparse.indices[sparse.indptr[0]:sparse.indptr[1]])
        self.assertNotIn(3, sparse.indices[sparse.indptr[0]:sparse.indptr[1]])
        self.assertEqual(sparse[0, 1], 0)
        with self.assertRaises(ValueError): sparse_supported(d, 3)

    def test_strict_boundary_and_unsupported_visual_penalty(self):
        row = [0, .1, .2, .2, np.inf]
        self.assertEqual(row_recall(row, [1, 3], 0, 2), 1)
        self.assertEqual(row_recall(row, [2, 3], 0, 2), .5)
        self.assertEqual(row_recall(row, [1, 4], 0, 2), .5)
        source = np.array([[0, .1, np.inf], [.1, 0, .2], [np.inf, .2, 0]])
        result = evaluate(source, [[0, 0], [1, 0], [.01, 0]], ['a','b','c'], np.ones(3, dtype=bool), ks=(1,))
        self.assertEqual(result['score'], 0)

    def test_promotion_all_gates_and_order(self):
        baseline = {'score': .2, 'recall': {str(k): .2 for k in [5,10,20]}}
        def config(order=0): return {'order': order, 'successfulSeeds': 3, 'score': {'mean': .3, 'min': .25}, 'recall': {str(k): {'mean': .3} for k in [5,10,20]}}
        for mutate in [lambda c: c.update(successfulSeeds=2), lambda c: c['score'].update(mean=.21), lambda c: c['score'].update(min=.2), lambda c: c['recall']['5'].update(mean=.19)]:
            c=config(); mutate(c)
            with self.assertRaises(RuntimeError): select([c], baseline)
        self.assertEqual(select([config(1), config(0)], baseline)['order'], 0)
        a,b=config(0),config(1);b['score']['min']=.26
        self.assertEqual(select([a,b], baseline)['order'], 1)
        a,b=config(0),config(1);b['score'].update(mean=.31,min=.24)
        self.assertEqual(select([a,b], baseline)['order'], 1)
        boundary = config()
        boundary['score'].update(mean=baseline['score']+.02,min=.201)
        boundary['recall']['5']['mean']=baseline['recall']['5']
        self.assertIs(select([boundary], baseline), boundary)
        with self.assertRaises(RuntimeError): select([], baseline)

if __name__ == '__main__': unittest.main()
