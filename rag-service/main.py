from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from services.embedder import EmbeddingService
from services.retriever import RetrievalService
from services.pdf_processor import PDFProcessor
import config
import tempfile
from pathlib import Path

app = FastAPI(title="Fitness RAG Service")

embedder = EmbeddingService()
retriever = RetrievalService(config.CHROMA_PERSIST_DIR)
pdf_processor = PDFProcessor()

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    domain: str = None

class DocumentRequest(BaseModel):
    content: str
    metadata: dict

@app.post("/search")
async def search_knowledge(request: SearchRequest):
    query_embedding = embedder.embed_text(request.query)
    results = retriever.search(query_embedding, request.query, request.top_k, request.domain)
    return {"results": results}

@app.post("/documents")
async def add_document(request: DocumentRequest):
    embedding = embedder.embed_text(request.content)
    doc_ids = retriever.add_documents([request.content], [embedding], [request.metadata])
    return {"status": "success", "doc_id": doc_ids[0]}

@app.post("/import/file")
async def import_file(file: UploadFile = File(...), domain: str = "general"):
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if file.filename.endswith('.pdf'):
            text = pdf_processor.extract_text(tmp_path)
        elif file.filename.endswith('.md'):
            with open(tmp_path, 'r', encoding='utf-8') as f:
                text = f.read()
        else:
            return {"status": "error", "message": "不支持的文件格式"}

        chunks = pdf_processor.chunk_text(text)
        embeddings = embedder.embed_batch(chunks)
        metadatas = [{
            "source": file.filename,
            "domain": domain,
            "chunk_index": i,
            "type": "pdf" if file.filename.endswith('.pdf') else "markdown"
        } for i in range(len(chunks))]

        retriever.add_documents(chunks, embeddings, metadatas)

        return {"status": "success", "chunks_added": len(chunks), "source": file.filename}
    finally:
        Path(tmp_path).unlink()

@app.delete("/documents/by-source/{source_name}")
async def delete_by_source(source_name: str):
    deleted_count = retriever.delete_by_source(source_name)
    return {"status": "success", "chunks_deleted": deleted_count}

@app.get("/documents/sources")
async def list_sources():
    sources = retriever.list_sources()
    return {"sources": sources}

@app.post("/import/rescan")
async def rescan_directory(force: bool = False):
    if force:
        retriever.collection.delete(where={})

    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent))
    from scripts.batch_import import batch_import_all

    result = batch_import_all()
    return {"status": "success", "files_processed": result['files'], "chunks_added": result['chunks']}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
