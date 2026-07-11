"""Validate the repository's three knowledge-source layers without modifying them."""
import argparse
import json
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--l1", type=Path, default=REPO_DIR / "l1-faq" / "faq.json")
    parser.add_argument("--l2", type=Path, default=REPO_DIR / "l2-core")
    parser.add_argument("--l3", type=Path, default=REPO_DIR / "l3-books")
    args = parser.parse_args()
    errors = []
    try:
        faqs = json.loads(args.l1.read_text(encoding="utf-8"))
        ids = [item.get("id") for item in faqs]
        required = {"id", "question", "answer"}
        errors += [f"L1 item {index} missing required fields" for index, item in enumerate(faqs) if not required <= item.keys()]
        if len(ids) != len(set(ids)):
            errors.append("L1 contains duplicate IDs")
    except Exception as exc:
        errors.append(f"L1 invalid: {exc}")
        faqs = []
    counts = {"l1": len(faqs)}
    for layer, root in (("l2", args.l2), ("l3", args.l3)):
        files = list(root.glob("*.md")) if root.exists() else []
        nonempty = [path for path in files if path.read_text(encoding="utf-8").strip()]
        counts[layer] = len(nonempty)
        if not files:
            errors.append(f"{layer.upper()} has no Markdown files")
        if len(nonempty) != len(files):
            errors.append(f"{layer.upper()} has {len(files) - len(nonempty)} empty files")
    print(f"L1 entries={counts['l1']} L2 files={counts['l2']} L3 files={counts['l3']}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)
    print("structure check passed")


if __name__ == "__main__":
    main()
