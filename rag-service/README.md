# RightNow RAG 服务

本目录集中管理 RAG 服务代码、权威文档和可版本化知识源。

## 目录

```text
rag-service/
├── docs/
│   ├── RAG_COMPLETE_DESIGN_AND_EXECUTION.md
│   └── KNOWLEDGE_SOURCE_INVENTORY.md
├── knowledge/
│   ├── l1-faq/
│   ├── l2-core/
│   └── l3-books/
├── scripts/
├── services/
├── config.py
└── main.py
```

- [完整设计与执行步骤](docs/RAG_COMPLETE_DESIGN_AND_EXECUTION.md)：当前架构、在线链路、灌库、部署、降级和验收的权威说明。
- [知识源清单](docs/KNOWLEDGE_SOURCE_INVENTORY.md)：已落地内容和后续来源清单。
- `knowledge/`：L1/L2/L3 权威知识源。Chroma 索引是可重建运行时数据，不进入 Git。

## 本地启动

从仓库根目录执行：

```powershell
python rag-service/scripts/structure_check.py
python rag-service/scripts/ingest_all.py --force
npm run dev:rag
```

服务默认监听 `http://127.0.0.1:8000`。首次运行需要安装 `requirements.txt` 中的 Python 依赖和下载 embedding 模型；生产运行使用离线模型缓存。

## 核心接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/search` | 自动多层或指定 collection 检索 |
| `POST` | `/import/faq-l1` | 导入 L1 FAQ |
| `POST` | `/import/rescan-l1` | 重建 L1 |
| `POST` | `/import/rescan-l2` | 重建 L2 |
| `POST` | `/import/rescan-l3` | 重建 L3 |
| `POST` | `/import/rescan-all` | 重建全部知识层 |
| `GET` | `/health` | 检查模型、层状态和向量数量 |

旧版顺序检索仅作为兼容代码保留，默认 `RAG_USE_LEGACY=false`。当前主路径是 L1/L2/L3 并行检索、L1 高置信短路，以及默认关闭的 L4 Web 兜底。
