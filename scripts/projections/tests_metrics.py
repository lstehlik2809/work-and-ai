import unittest
import numpy as np
from metrics import jaccard_distances, row_recall, top_neighbors, normalize, stability

class MetricTests(unittest.TestCase):
    def test_boundary_ties_full_credit(self):
        # One strict neighbor, two exchangeable boundary neighbors, quota one.
        self.assertEqual(row_recall([0, .1, .2, .2, .9], [1, 3], 0, 2), 1)

    def test_missed_strict_is_penalized(self):
        self.assertEqual(row_recall([0, .1, .2, .2, .9], [2, 3], 0, 2), .5)
        self.assertEqual(row_recall([0, .1, .2, .2, .9], [1, 4], 0, 2), .5)

    def test_duplicates_and_empty_sets(self):
        distances = jaccard_distances([[0, 0], [0, 0], [1, 0], [1, 0], [1, 1]])
        np.testing.assert_array_equal(distances[0], [0, 0, 1, 1, 1])
        np.testing.assert_array_equal(distances[2], [1, 1, 0, 0, .5])
        self.assertEqual(row_recall(distances[2], [3], 2, 1), 1)
        self.assertEqual(row_recall(distances[0], [1], 0, 1), 1)

    def test_self_exclusion_and_code_ties(self):
        points = [[0, 0], [0, 0], [0, 0]]
        np.testing.assert_array_equal(top_neighbors(points, ['c', 'b', 'a'], 2), [[2, 1], [2, 0], [1, 0]])
        with self.assertRaises(ValueError):
            row_recall([0, .1, .2], [0], 0, 1)

    def test_isotropic_normalization(self):
        np.testing.assert_array_equal(normalize([[0, 0], [2, 1]]), [[.1, .3], [.9, .7]])

    def test_stability_counts_equivalent_profiles(self):
        a, b = np.array([[0, 1, 2]]), np.array([[3, 4, 5]])
        self.assertAlmostEqual(stability(a, b, ['x', 'x', 'y', 'x', 'y', 'z'], (3,))['3'], 2 / 3)

if __name__ == '__main__':
    unittest.main()
