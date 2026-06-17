from pathlib import Path

from langchain_community.document_loaders import TextLoader
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter

import config


class IngestService:
    def __init__(self, vectorstore: Chroma):
        self.vectorstore = vectorstore
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
        )

    def ingest_file(self, path: str, metadata: dict = None) -> int:
        loader = TextLoader(path, encoding="utf-8", autodetect_encoding=True)
        docs = self.splitter.split_documents(loader.load())
        if metadata:
            for doc in docs:
                doc.metadata.update(metadata)
        self.vectorstore.add_documents(docs)
        return len(docs)

    def ingest_directory(self, data_dir: str) -> dict:
        data_path = Path(data_dir)
        total = 0
        for category_dir in sorted(data_path.iterdir()):
            if not category_dir.is_dir():
                continue

            domain = config.DOMAIN_MAP.get(category_dir.name, "comprehensive")
            files = list(category_dir.rglob("*.md"))
            for md_file in files:
                try:
                    loader = TextLoader(str(md_file), encoding="utf-8", autodetect_encoding=True)
                    docs = self.splitter.split_documents(loader.load())
                    for doc in docs:
                        doc.metadata.update(
                            {
                                "source": md_file.name,
                                "domain": domain,
                                "category": category_dir.name,
                                "type": "markdown",
                            }
                        )
                    self.vectorstore.add_documents(docs)
                    total += len(docs)
                except Exception as exc:
                    print(f"Failed to ingest {md_file.name}: {exc}")
            print(f"Ingested {category_dir.name}: {len(files)} files")
        return {"chunks": total}
