"""
Web 搜索客户端 — Layer 3 兜底

支持 SerpAPI / DuckDuckGo（免 API Key）两种引擎。
需要 VALUES_FILTER_PROMPT 做价值观后过滤。
"""
from langchain_core.documents import Document
import config


# 生活化减脂价值观过滤 prompt
VALUES_FILTER_PROMPT = """你是一个内容过滤器。判断以下搜索结果是否与"生活化减脂"健身理念一致。

生活化减脂的核心主张：
- 不极端节食，不追求快速瘦身（反对"7天瘦10斤"）
- 吃食堂外卖也能减脂，强调可操作的日常执行
- 减脂是长期生活方式的调整，不是短期冲刺
- 尊重科学，反对伪科学减脂方法
- 注重可持续性，不推荐无法坚持的极端方案

搜索结果内容：{content}

请用"一致"或"不一致"回答。如果信息不涉及减脂/健身，也回答"不一致"。
只输出一个词：一致 或 不一致"""


class WebSearchClient:
    """Web 搜索客户端。

    优先 SerpAPI（需要 API Key），
    降级 DuckDuckGo（免费但限制较多）。
    """

    def __init__(self):
        self.engine = config.WEB_SEARCH_ENGINE
        self.api_key = config.WEB_SEARCH_API_KEY

    def search(self, query: str, top_k: int = 5) -> list[Document]:
        """执行 web 搜索，返回 LangChain Document 列表。"""
        search_query = f"{query} 健身 减脂"
        raw_results = []

        if self.engine == "serpapi" and self.api_key:
            raw_results = self._search_serpapi(search_query, top_k)
        else:
            raw_results = self._search_duckduckgo(search_query, top_k)

        # 转成 LangChain Document
        docs = []
        for r in raw_results:
            content = r.get("snippet", "") or r.get("body", "")
            url = r.get("link", "") or r.get("href", "")
            if not content:
                continue
            docs.append(Document(
                page_content=content,
                metadata={
                    "source": url,
                    "type": "web",
                    "domain": "comprehensive",
                    "priority": "fallback",
                }
            ))
        return docs

    def filter_by_values(self, docs: list[Document], llm_filter_fn) -> list[Document]:
        """用 LLM 过滤掉与生活化减脂理念冲突的结果。

        llm_filter_fn: (content: str) -> bool
        """
        filtered = []
        for doc in docs:
            if llm_filter_fn(doc.page_content):
                filtered.append(doc)
        return filtered

    # ─── 私有方法 ───

    def _search_serpapi(self, query: str, top_k: int) -> list[dict]:
        try:
            from serpapi import GoogleSearch
            params = {
                "q": query,
                "api_key": self.api_key,
                "num": top_k,
                "hl": "zh-CN",
                "gl": "cn",
            }
            search = GoogleSearch(params)
            results = search.get_dict()
            return results.get("organic_results", [])[:top_k]
        except ImportError:
            print("[WebSearch] serpapi not installed, falling back to DuckDuckGo")
            return self._search_duckduckgo(query, top_k)
        except Exception as exc:
            print(f"[WebSearch] SerpAPI error: {exc}")
            return []

    def _search_duckduckgo(self, query: str, top_k: int) -> list[dict]:
        try:
            from duckduckgo_search import DDGS
            results = []
            with DDGS() as ddgs:
                for r in ddgs.text(query, max_results=top_k):
                    results.append({
                        "snippet": r.get("body", ""),
                        "link": r.get("href", ""),
                    })
            return results
        except ImportError:
            print("[WebSearch] duckduckgo-search not installed")
            return []
        except Exception as exc:
            print(f"[WebSearch] DuckDuckGo error: {exc}")
            return []
