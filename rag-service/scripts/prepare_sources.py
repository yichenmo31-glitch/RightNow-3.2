"""Copy, normalize, and deduplicate L2/L3 Markdown into a disposable output tree."""
import argparse
import hashlib
import re
from pathlib import Path


def normalized(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    seen = set()
    copied = duplicates = empty = 0
    for source in args.source:
        destination = args.output / source.name
        destination.mkdir(parents=True, exist_ok=True)
        for path in sorted(source.glob("*.md")):
            text = normalized(path.read_text(encoding="utf-8"))
            if not text.strip():
                empty += 1
                continue
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if digest in seen:
                duplicates += 1
                continue
            seen.add(digest)
            (destination / path.name).write_text(text, encoding="utf-8")
            copied += 1
    print(f"files={copied} empty={empty} exact_duplicates={duplicates} output={args.output}")
    if empty:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
