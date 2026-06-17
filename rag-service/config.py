from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent

EMBEDDING_MODEL         = os.getenv("RAG_EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
EMBEDDING_QUERY_PREFIX  = os.getenv("RAG_QUERY_PREFIX", "为这个句子生成表示以用于检索相关文章：")
CHROMA_PERSIST_DIR      = os.getenv("RAG_CHROMA_PERSIST_DIR", str(BASE_DIR / "chroma_db"))
CHUNK_SIZE              = int(os.getenv("RAG_CHUNK_SIZE", "800"))
CHUNK_OVERLAP           = int(os.getenv("RAG_CHUNK_OVERLAP", "100"))
CLEANED_DATA_PATH       = os.getenv("RAG_CLEANED_DATA_PATH", "/data/cleaned-data")
USE_RERANKING           = os.getenv("RAG_USE_RERANKING", "false").lower() == "true"
RERANKING_MODEL         = os.getenv("RAG_RERANKING_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
CORS_ORIGINS            = os.getenv("RAG_CORS_ORIGINS", "*")

# 中文分类目录 → 后端使用的 domain 标识
DOMAIN_MAP: dict[str, str] = {
    "运动学":       "kinesiology",
    "营养学":       "nutrition",
    "肌理学":       "kinesiology",
    "测试与评估":   "comprehensive",
    "训练与实操":   "comprehensive",
    "心理与康复":   "comprehensive",
    "生活化减脂内核": "comprehensive",
}
