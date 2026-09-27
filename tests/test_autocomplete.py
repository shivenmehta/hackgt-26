import json
import unittest
from unittest.mock import patch
from src.lib.location import autocomplete


class AutocompleteTests(unittest.TestCase):
    def setUp(self):
        autocomplete.CACHE.clear()

    def test_partial_query_normalization_filter_and_cache(self):
        feature = {'properties': {'name': 'Peachtree Street', 'city': 'Atlanta', 'state': 'Georgia', 'countrycode': 'US'},
                   'geometry': {'coordinates': [-84.38, 33.77]}}
        foreign = {**feature, 'properties': {**feature['properties'], 'countrycode': 'CA'}}
        invalid = {**feature, 'geometry': {'coordinates': [float('nan'), 33]}}
        with patch.object(autocomplete, 'urlopen') as request:
            request.return_value.__enter__.return_value.read.return_value = json.dumps({'features': [feature, feature, foreign, invalid, {}]})
            result = autocomplete.suggest_addresses(' Peach tree ')
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]['latitude'], 33.77)
            self.assertIn('Atlanta', result[0]['address'])
            self.assertEqual(autocomplete.suggest_addresses('peach tree'), result)
            self.assertEqual(request.call_count, 1)
            self.assertIn('countrycode=US', request.call_args.args[0].full_url)

    def test_short_query_no_network_and_invalid_input(self):
        with patch.object(autocomplete, 'urlopen') as request:
            self.assertEqual(autocomplete.suggest_addresses('ab'), [])
            request.assert_not_called()
        for query in (None, {}, 'a' * 201):
            with self.subTest(query=query), self.assertRaises(ValueError):
                autocomplete.suggest_addresses(query)

    def test_failure_not_cached(self):
        with patch.object(autocomplete, 'urlopen', side_effect=OSError('offline')):
            with self.assertRaises(RuntimeError):
                autocomplete.suggest_addresses('Atlanta')
        self.assertEqual(len(autocomplete.CACHE), 0)
