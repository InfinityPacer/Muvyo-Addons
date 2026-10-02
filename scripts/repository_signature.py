"""为仓库索引签名或验签，签名凭据只交给官方工具在内存中加载。"""

import argparse
import base64
import importlib.util
import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def sign_index(path, key):
    """递增索引序号并签署原始字节，拒绝替换客户端已经信任的公钥。"""
    index = json.loads(path.read_bytes())
    public_key = base64.b64encode(key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )).decode("ascii")
    if index.get("public_key") and index["public_key"] != public_key:
        raise ValueError("签名密钥与仓库公钥不同，请使用原仓库凭据")
    index["public_key"] = public_key
    index["sequence"] = int(index.get("sequence") or 0) + 1
    data = (json.dumps(index, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    signature = key.sign(data)
    key.public_key().verify(signature, data)
    path.write_bytes(data)
    path.with_name(path.name + ".sig").write_text(
        base64.b64encode(signature).decode("ascii") + "\n", encoding="ascii"
    )


def verify_index(path):
    """直接校验文件字节，空白或换行变化也必须使签名失效。"""
    data = path.read_bytes()
    index = json.loads(data)
    key = Ed25519PublicKey.from_public_bytes(base64.b64decode(index["public_key"]))
    signature = base64.b64decode(path.with_name(path.name + ".sig").read_bytes())
    key.verify(signature, data)
    return index["sequence"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("sign", "verify"))
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--credential", type=Path, default=Path("muvyo-signing.json"))
    args = parser.parse_args()
    if args.command == "sign":
        spec = importlib.util.spec_from_file_location("mv_addon", args.repo / "mv_addon.py")
        official = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(official)
        # 仓库信任的是固定公钥，续签作者证书后仍可用原密钥维护仓库索引。
        _, key = official.load_credential(args.credential)
        sign_index(args.repo / "index.json", key)
    sequence = verify_index(args.repo / "index.json")
    print(f"仓库索引签名有效，sequence={sequence}")


if __name__ == "__main__":
    main()
