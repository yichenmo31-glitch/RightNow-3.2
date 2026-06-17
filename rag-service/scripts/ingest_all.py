"""
一键入库：把 cleaned-data 全部导入 ChromaDB
用法：python scripts/ingest_all.py
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
sys.stdout.reconfigure(encoding='utf-8')

import config
from services.retriever import build_embeddings, build_vectorstore
from services.ingest import IngestService


def main():
    print(f"加载 embedding 模型: {config.EMBEDDING_MODEL}")
    embeddings = build_embeddings()
    vectorstore = build_vectorstore(embeddings)
    svc = IngestService(vectorstore)

    print(f"开始入库: {config.CLEANED_DATA_PATH}\n")
    result = svc.ingest_directory(config.CLEANED_DATA_PATH)
    print(f"\n完成！共入库 {result['chunks']} 个 chunk")


if __name__ == "__main__":
    main()
