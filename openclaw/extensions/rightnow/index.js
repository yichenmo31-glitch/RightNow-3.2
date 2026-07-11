// RightNow plugin entrypoint
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerRightNowTools } from "./src/rightnow-tools.js";
import { registerKnowledgeTools } from "./src/rightnow-knowledge.js";

function resolveConfig(api) {
  const cfg = api.pluginConfig || {};
  return {
    rightnowApiBase:
      cfg.rightnowApiBase ||
      process.env.RIGHTNOW_API_BASE ||
      "http://backend:5000/api",
    agentServiceToken:
      cfg.agentServiceToken || process.env.AGENT_SERVICE_TOKEN || "",
    ragServiceUrl:
      cfg.ragServiceUrl || process.env.RAG_SERVICE_URL || "http://rag:8000",
  };
}

export default definePluginEntry({
  id: "rightnow",
  name: "RightNow Fitness Coach",
  description:
    "RightNow fitness platform data tools and knowledge base integration",
  register(api) {
    const config = resolveConfig(api);

    registerRightNowTools(api, config);
    registerKnowledgeTools(api, config);

    if (typeof api.registerMemoryPromptSupplement !== "function") return;

    api.registerMemoryPromptSupplement(({ availableTools }) => {
      const lines = [];
      const dataTools = [...availableTools].filter((t) =>
        t.startsWith("rightnow_")
      );
      const kbTools = [...availableTools].filter((t) =>
        t.startsWith("search_")
      );

      if (dataTools.length === 0 && kbTools.length === 0) return lines;

      lines.push("## RightNow 健身教练专用工具");
      lines.push("");

      if (dataTools.length > 0) {
        lines.push("### 数据工具");
        lines.push(
          "你通过 rightnow_ 系列工具读写用户的健身数据。这些工具直接操作 RightNow 后端数据库。"
        );
        lines.push("");
        lines.push("### 核心流程");
        lines.push("1. 每条用户消息先调用 rightnow_classify_intent；绑定码除外，直接调用 rightnow_bind_email");
        lines.push("2. 严格按分类结果的 suggestedTools 顺序调用；requiresContext=false 时不要读取完整上下文");
        lines.push("3. requiresWriteTool=true 只表示可能需要写入；饮食估算须先展示并确认，明确训练/体重记录可直接写入");
        lines.push("4. riskLevel=high 时使用保守措辞，禁止激进训练或节食建议，并优先检索深层安全知识");
        lines.push("5. 最终回复遵循 responseMode；unknown_mixed 最多问一个关键澄清问题");
        lines.push("6. intent=out_of_domain 时不调用任何 RightNow 数据或知识工具，将任务交回通用 Agent");
        lines.push("");
      }

      if (kbTools.length > 0) {
        lines.push("### 知识库工具");
        lines.push(
          "- search_faq: 优先使用。适合用户问常见问题（怎么减脂、平台期怎么办、什么动作练胸）。使用较高的 minScore (0.5+) 以获得精确匹配。"
        );
        lines.push(
          "- search_core_theory: 当 FAQ 无结果或需要更深入理论时使用。"
        );
        lines.push(
          "- search_books: 当需要深度营养学知识时使用。"
        );
        lines.push("");
      }

      return lines;
    });
  },
});
