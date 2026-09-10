import unittest
from evaluate import select

BASELINE = {'score': .3, 'recall': {'5': .2, '10': .3, '20': .4}}

def config(order=0, score=.34, worst=.32, recalls=(.24, .34, .44), successes=3):
    return {'order': order, 'successfulSeeds': successes, 'score': {'mean': score, 'min': worst},
            'recall': {str(k): {'mean': value} for k, value in zip((5, 10, 20), recalls)}}

class SelectionTests(unittest.TestCase):
    def test_gate_and_fixed_order(self):
        first, second = config(0), config(1)
        selected, qualifies = select([second, first], BASELINE)
        self.assertIs(selected, first)
        self.assertTrue(qualifies)

    def test_exact_tie_uses_worst_seed_before_order(self):
        first, second = config(0), config(1, worst=.33)
        self.assertIs(select([first, second], BASELINE)[0], second)

    def test_each_gate_can_reject(self):
        cases = [config(score=.31), config(worst=.3), config(recalls=(.19, .4, .5))]
        for candidate in cases:
            with self.subTest(candidate=candidate):
                selected, qualifies = select([candidate], BASELINE)
                self.assertFalse(qualifies)
                self.assertIs(selected, candidate)  # optional UMAP remains available

    def test_failed_seed_configuration_cannot_win(self):
        failed, good = config(score=.8, successes=2), config(1)
        self.assertIs(select([failed, good], BASELINE)[0], good)

    def test_no_complete_configuration_is_explicit_failure(self):
        with self.assertRaisesRegex(RuntimeError, 'No fully successful'):
            select([config(successes=2)], BASELINE)

if __name__ == '__main__':
    unittest.main()
