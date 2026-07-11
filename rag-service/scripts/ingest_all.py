"""Import the repository L1/L2/L3 knowledge sources into persistent Chroma."""
import argparse
import os
import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = SERVICE_DIR.parent
sys.path.insert(0, str(SERVICE_DIR))


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--l1", type=Path, default=REPO_DIR / "l1-faq" / "faq.json")
    parser.add_argument("--l2", type=Path, default=REPO_DIR / "l2-core")
    parser.add_argument("--l3", type=Path, default=REPO_DIR / "l3-books")
    parser.add_argument("--persist-dir", type=Path, default=SERVICE_DIR / ".work" / "chroma")
    parser.add_argument("--force", action="store_true", help="clear each collection before import")
    return parser.parse_args()


def clear(vectorstore):
    ids = vectorstore._collection.get()["ids"]
    if ids:
        vectorstore._collection.delete(ids=ids)


def main():
    args = parse_args()
    for source in (args.l1, args.l2, args.l3):
        if not source.exists():
            raise SystemExit(f"knowledge source not found: {source}")
    args.persist_dir.mkdir(parents=True, exist_ok=True)

    os.environ.update({
        "RAG_L1_FAQ_PATH": str(args.l1.resolve()),
        "RAG_L2_DATA_PATH": str(args.l2.resolve()),
        "RAG_L3_DATA_PATH": str(args.l3.resolve()),
        "RAG_L1_CHROMA_DIR": str((args.persist_dir / "l1").resolve()),
        "RAG_L2_CHROMA_DIR": str((args.persist_dir / "l2").resolve()),
        "RAG_L3_CHROMA_DIR": str((args.persist_dir / "l3").resolve()),
    })
    import config
    from services.faq_ingest import FaqIngestService
    from services.ingest import IngestService
    from services.retriever import (
        build_embeddings, build_l1_vectorstore, build_l2_vectorstore, build_l3_vectorstore,
    )

    embeddings = build_embeddings()
    stores = (build_l1_vectorstore(embeddings), build_l2_vectorstore(embeddings), build_l3_vectorstore(embeddings))
    if args.force:
        for store in stores:
            clear(store)
    results = {
        "l1": FaqIngestService(stores[0]).ingest_json(str(args.l1)),
        "l2": IngestService(stores[1]).ingest_flat(str(args.l2), domain="comprehensive"),
        "l3": IngestService(stores[2]).ingest_flat(str(args.l3), domain="comprehensive"),
    }
    for layer, store in zip(("l1", "l2", "l3"), stores):
        print(f"{layer}: imported={results[layer]['chunks']} persisted={store._collection.count()} collection={getattr(config, layer.upper() + '_COLLECTION')}")


if __name__ == "__main__":
    main()
