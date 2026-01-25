import re
import unittest

from bot.content_flow import parse_content_args
from shared.config import _get_kv_map, _get_str_list
from shared.escrow import calculate_fees
from shared.id_utils import generate_public_id
from shared.transactions import generate_transaction_ref


class CoreTests(unittest.TestCase):
    def test_generate_public_id_format(self):
        public_id = generate_public_id()
        self.assertEqual(len(public_id), 4)
        self.assertIsNotNone(re.fullmatch(r"[A-Z0-9]{4}", public_id))

    def test_generate_transaction_ref_format(self):
        ref = generate_transaction_ref()
        self.assertTrue(ref.startswith("txn_"))
        self.assertGreater(len(ref), 8)

    def test_calculate_fees_access_fee(self):
        platform_fee, receiver = calculate_fees(5000, "access_fee")
        self.assertEqual(platform_fee, 5000)
        self.assertIsNone(receiver)

    def test_calculate_fees_split(self):
        platform_fee, receiver = calculate_fees(1000, "session")
        self.assertEqual(platform_fee, 200)
        self.assertEqual(receiver, 800)

    def test_parse_content_args_success(self):
        parsed = parse_content_args("photo 2500 Summer Vibes | Teaser pack")
        self.assertEqual(
            parsed,
            {
                "content_type": "photo",
                "price": 2500.0,
                "title": "Summer Vibes",
                "description": "Teaser pack",
            },
        )

    def test_parse_content_args_invalid(self):
        self.assertIsNone(parse_content_args("photo"))
        self.assertIsNone(parse_content_args("photo nope title"))

    def test_get_str_list(self):
        self.assertEqual(_get_str_list("a,b, c"), ["a", "b", "c"])
        self.assertEqual(_get_str_list(""), [])

    def test_get_kv_map(self):
        mapping = _get_kv_map("TRC20=addr1;BTC=addr2,ETH=addr3")
        self.assertEqual(mapping, {"TRC20": "addr1", "BTC": "addr2", "ETH": "addr3"})


if __name__ == "__main__":
    unittest.main()
