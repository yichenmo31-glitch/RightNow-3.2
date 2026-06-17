"""
一键入库：把所有知识库分层导入 ChromaDB

用法：
  python scripts/ingest_all.py              # 入库所有层
  python scripts/ingest_all.py --blogger     # 只入库 Layer 1（博主）
  python scripts/ingest_all.py --layer2      # 只入库 Layer 2（专业书）
  python scripts/ingest_all.py --blogger --layer2  # 全部入库
"""
import sys, os
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8')

import config
from services.retriever import build_embeddings, build_vectorstore, build_blogger_vectorstore
from services.ingest import IngestService, BloggerIngestService


def ingest_blogger():
    if not config.USE_BLOGGER or not config.BLOGGER_DATA_PATH:
        print("[Layer 1] SKIP — BLOGGER_DATA_PATH not configured")
        return
    data = Path(config.BLOGGER_DATA_PATH)
    if not data.exists():
        print(f"[Layer 1] SKIP — path not found: {data}")
        return

    print(f"[Layer 1] Loading embedding: {config.EMBEDDING_MODEL}")
    embeddings = build_embeddings()
    vs = build_blogger_vectorstore(embeddings)
    if vs is None:
        print("[Layer 1] SKIP — vectorstore init failed")
        return
    svc = BloggerIngestService(vs)

    print(f"[Layer 1] Ingesting: {config.BLOGGER_DATA_PATH}")
    result = svc.ingest_directory(config.BLOGGER_DATA_PATH)
    print(f"[Layer 1] Done — {result['chunks']} chunks\n")


def ingest_layer2():
    data = Path(config.CLEANED_DATA_PATH)
    if not data.exists():
        print(f"[Layer 2] SKIP — path not found: {data}")
        return

    print(f"[Layer 2] Loading embedding: {config.EMBEDDING_MODEL}")
    embeddings = build_embeddings()
    vs = build_vectorstore(embeddings)
    svc = IngestService(vs)

    print(f"[Layer 2] Ingesting: {config.CLEANED_DATA_PATH}")
    result = svc.ingest_directory(config.CLEANED_DATA_PATH)
    print(f"[Layer 2] Done — {result['chunks']} chunks\n")


def main():
    args = set(sys.argv[1:])
    do_blogger = "--blogger" in args
    do_layer2 = "--layer2" in args
    if not do_blogger and not do_layer2:
        do_blogger = do_layer2 = True  # 默认全部

    print("=" * 60)
    print("RightNow RAG — Multi-Layer Ingest")
    print("=" * 60)
    print(f"Embedding model: {config.EMBEDDING_MODEL}")
    print(f"Layer 1 (blogger): {'ENABLED' if do_blogger else 'SKIP'}")
    print(f"Layer 2 (books):   {'ENABLED' if do_layer2 else 'SKIP'}")
    print()

    if do_blogger:
        ingest_blogger()
    if do_layer2:
        ingest_layer2()

    print("=" * 60)
    print("All done.")


if __name__ == "__main__":
    main()
