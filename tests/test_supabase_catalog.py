import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.lib.nutrition.supabase_catalog import load_supabase_foods, read_env_file


def row(fdc_id):
    return {"fdc_id": fdc_id, "source_record": {"name": "Food", "food": {
        "fdcId": fdc_id, "description": "Food", "dataType": "Foundation", "foodNutrients": []}}}


class SupabaseCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = Path(self.temp.name) / ".env.local"
        self.env.write_text('NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co"\n'
                            'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-key # comment\n', encoding="utf-8")
        env_patch = patch.dict("os.environ", {}, clear=True)
        env_patch.start()
        self.addCleanup(env_patch.stop)

    def test_env_quotes_and_comments(self):
        self.assertEqual(read_env_file(self.env)["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "test-key")

    @patch("src.lib.nutrition.supabase_catalog._get_page")
    def test_paginates_even_when_server_returns_less_than_requested(self, get_page):
        get_page.side_effect = [([row(1)], 2), ([row(2)], 2)]
        records = load_supabase_foods(self.env, page_size=100)
        self.assertEqual(len(records), 2)
        self.assertEqual(get_page.call_args_list[1].args[2], 1)

    @patch("src.lib.nutrition.supabase_catalog._get_page")
    def test_rejects_duplicate_ids(self, get_page):
        get_page.return_value = ([row(1), row(1)], 2)
        with self.assertRaises(ValueError):
            load_supabase_foods(self.env)

    @patch("src.lib.nutrition.supabase_catalog._get_page")
    def test_rejects_empty_catalog(self, get_page):
        get_page.return_value = ([], 0)
        with self.assertRaises(ValueError):
            load_supabase_foods(self.env)

    @patch("src.lib.nutrition.supabase_catalog._get_page")
    def test_rejects_changing_count(self, get_page):
        get_page.side_effect = [([row(1)], 2), ([row(2)], 3)]
        with self.assertRaises(ValueError):
            load_supabase_foods(self.env)

    @patch("src.lib.nutrition.supabase_catalog._get_page")
    def test_rejects_mismatched_source_id(self, get_page):
        bad = row(1)
        bad["source_record"]["food"]["fdcId"] = 2
        get_page.return_value = ([bad], 1)
        with self.assertRaises(ValueError):
            load_supabase_foods(self.env)
