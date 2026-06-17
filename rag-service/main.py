from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.documents import Document
import tempfile, os
from pathlib import Path

import config
from services.retriever import build_embeddings, build_vectorstore, RetrieverService
from services.ingest import IngestService


app = FastAPI(title="RightNow RAG Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 启动时初始化共享资源
_embeddings  = build_embeddings()
_vectorstore = build_vectorstore(_embeddings)
retriever    = RetrieverService(_vectorstore)
ingestor     = IngestService(_vectorstore)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    domain: str = None

class DocumentRequest(BaseModel):
    content: str
    metadata: dict = {}


@app.post("/search")
async def search_knowledge(request: SearchRequest):
    docs = retriever.search(request.query, request.top_k, request.domain)
    return {"results": {
        "documents": [[d.page_content for d in docs]],
        "metadatas":  [[d.metadata    for d in docs]],
    }}


@app.post("/documents")
async def add_document(request: DocumentRequest):
    doc = Document(page_content=request.content, metadata=request.metadata)
    _vectorstore.add_documents([doc])
    return {"status": "success"}


@app.post("/import/file")
async def import_file(file: UploadFile = File(...), domain: str = "general"):
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        n = ingestor.ingest_file(tmp_path, {"source": file.filename, "domain": domain, "type": "upload"})
    finally:
        os.unlink(tmp_path)
    return {"status": "success", "chunks_added": n, "source": file.filename}


@app.delete("/documents/by-source/{source_name}")
async def delete_by_source(source_name: str):
    n = retriever.delete_by_source(source_name)
    return {"status": "success", "chunks_deleted": n}


@app.get("/documents/sources")
async def list_sources():
    return {"sources": retriever.list_sources()}


@app.post("/import/rescan")
async def rescan_directory(force: bool = False):
    if force:
        _vectorstore._collection.delete(where={})
    result = ingestor.ingest_directory(config.CLEANED_DATA_PATH)
    return {"status": "success", "chunks_added": result["chunks"]}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "embedding_model": config.EMBEDDING_MODEL,
        "vector_count": retriever.count(),
        "reranking": config.USE_RERANKING,
        "chunk_size": config.CHUNK_SIZE,
    }
