import chromadb
from sentence_transformers import CrossEncoder
import config

class RetrievalService:
    def __init__(self, persist_dir: str):
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection("fitness_knowledge")

        self.use_reranking = config.USE_RERANKING
        if self.use_reranking:
            self.reranker = CrossEncoder(config.RERANKING_MODEL)

    def add_documents(self, texts: list[str], embeddings: list, metadatas: list):
        import uuid
        ids = [str(uuid.uuid4()) for _ in range(len(texts))]
        self.collection.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
        return ids

    def delete_by_source(self, source_name: str):
        results = self.collection.get(where={"source": source_name})
        if results['ids']:
            self.collection.delete(ids=results['ids'])
        return len(results['ids'])

    def list_sources(self):
        all_docs = self.collection.get()
        sources = {}
        for metadata in all_docs['metadatas']:
            source = metadata.get('source', 'unknown')
            domain = metadata.get('domain', 'unknown')
            if source not in sources:
                sources[source] = {'domain': domain, 'chunks': 0}
            sources[source]['chunks'] += 1
        return [{'source': k, **v} for k, v in sources.items()]

    def search(self, query_embedding: list, query_text: str = "", top_k: int = 5, domain: str = None):
        where = {"domain": domain} if domain else None

        initial_k = top_k * 4 if self.use_reranking else top_k
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=initial_k,
            where=where
        )

        if not self.use_reranking:
            return results

        pairs = [[query_text, doc] for doc in results['documents'][0]]
        scores = self.reranker.predict(pairs)

        ranked_indices = scores.argsort()[::-1][:top_k]
        return {
            'documents': [[results['documents'][0][i] for i in ranked_indices]],
            'metadatas': [[results['metadatas'][0][i] for i in ranked_indices]],
            'distances': [[float(scores[i]) for i in ranked_indices]]
        }
