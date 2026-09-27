import unittest
from ranker import rank

class RankerTests(unittest.TestCase):
    def payload(self):
        return {'schemaVersion': 1, 'catalog': [{'id': x, 'nutrition': dict(calories=500, protein=25, fat=15, fiber=7, carbs=60)} for x in ['b', 'a']], 'eligible': [{'id': x, 'categories': ['breakfast', 'lunch', 'dinner']} for x in ['b', 'a']], 'dailyTargets': dict(calories=1500, protein=75, fat=45, fiber=21, carbs=180)}
    def test_exact_match_and_stable_tie(self):
        r = rank(self.payload()); self.assertEqual(r['rankings']['breakfast'][0]['id'], 'a')
        self.assertEqual(r['rankings']['dinner'][0]['distance'], 0)
        self.assertEqual(r['rankings']['lunch'][0]['portion'], 1)
        self.assertEqual(len(r['rankings']['lunch'][0]['options']), 7)
    def test_full_catalog_scales_survive_filter(self):
        p = self.payload(); p['catalog'][1]['nutrition']['calories'] = 1000
        expected = rank(p)['scales']; p['eligible'] = p['eligible'][:1]
        self.assertEqual(rank(p)['scales'], expected)
    def test_reject_bad_values_duplicates_and_unknown(self):
        for bad in [float('nan'), float('inf'), -1, True]:
            p = self.payload(); p['dailyTargets']['calories'] = bad
            with self.assertRaises(ValueError): rank(p)
        p = self.payload(); p['catalog'][1]['id'] = 'b'
        with self.assertRaises(ValueError): rank(p)
        p = self.payload(); p['eligible'][0]['id'] = 'missing'
        with self.assertRaises(ValueError): rank(p)

if __name__ == '__main__': unittest.main()
