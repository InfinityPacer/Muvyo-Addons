"""仓库签名必须保护原始索引字节并保持公钥连续性。"""

import json
from pathlib import Path
import tempfile
import unittest

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from scripts.repository_signature import sign_index, verify_index


class RepositorySignatureTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "index.json"
        self.path.write_text(json.dumps({"name": "测试", "sequence": 5, "plugins": []}))
        self.key = Ed25519PrivateKey.generate()

    def test_publish_and_update_keep_key_and_advance_sequence(self):
        sign_index(self.path, self.key)
        self.assertEqual(verify_index(self.path), 6)
        public_key = json.loads(self.path.read_bytes())["public_key"]
        sign_index(self.path, self.key)
        self.assertEqual(verify_index(self.path), 7)
        self.assertEqual(json.loads(self.path.read_bytes())["public_key"], public_key)

    def test_whitespace_change_invalidates_signature(self):
        sign_index(self.path, self.key)
        self.path.write_bytes(self.path.read_bytes() + b"\n")
        with self.assertRaises(InvalidSignature):
            verify_index(self.path)

    def test_replacement_key_does_not_change_published_files(self):
        sign_index(self.path, self.key)
        original = self.path.read_bytes()
        signature_path = self.path.with_name("index.json.sig")
        original_signature = signature_path.read_bytes()
        with self.assertRaises(ValueError):
            sign_index(self.path, Ed25519PrivateKey.generate())
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(signature_path.read_bytes(), original_signature)
        self.assertEqual(verify_index(self.path), 6)
