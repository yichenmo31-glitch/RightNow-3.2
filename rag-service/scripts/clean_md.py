"""
第一步：清洗 raw-data 中的 md 文件，输出到 cleaned-data/（目录结构保持不变）
用法：python scripts/clean_md.py
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

RAW_DIR  = Path(__file__).resolve().parent.parent.parent.parent / "raw-data"
OUT_DIR  = Path(__file__).resolve().parent.parent.parent.parent / "cleaned-data"

# ── 整块删除规则（多行） ────────────────────────────────────────────────
BLOCK_RULES = [
    # 1. MinerU 复合文件元头（"> 本文件由以下章节整合而成" 开头的 blockquote 块）
    re.compile(r'^> 本文件由以下章节整合而成[：:][^\n]*\n(?:> [^\n]*\n)*', re.MULTILINE),
    # 2. MinerU 三行元数据块
    re.compile(r'^> 来源 PDF[：:][^\n]*\n^> 原始 MinerU Markdown[：:][^\n]*\n^> 模块归属[：:][^\n]*\n?', re.MULTILINE),
    # 3. 学习目标套话段落（标题 + 跟随的 bullet 行）
    re.compile(r'^#+ 完成这一章的学习后[，,]你将能够[：:]\n(?:[^\n#][^\n]*\n)*', re.MULTILINE),
    # 4. 相关笔记块（直到下一个 ## 标题或文末）
    re.compile(r'^## 相关笔记\n[\s\S]*?(?=^##|\Z)', re.MULTILINE),
    # 5. 出版社版权块（ISBN/CIP/总主编/编辑委员会等行）
    re.compile(r'^(?:ISBN|CIP|总主编|责任编辑|编辑委员会|出版社|印刷|版次|定价)[^\n]*\n', re.MULTILINE),
]

# ── 单行删除规则 ────────────────────────────────────────────────────────
LINE_RULES = [
    re.compile(r'^## 来源章节[：:][^\n]*$', re.MULTILINE),   # 来源章节标记
    re.compile(r'^## Page \d+\s*$', re.MULTILINE),           # 页码标记
    re.compile(r'^(?:译者|审校|作者)[：:][^\n]+$', re.MULTILINE),  # 译者/审校行
    re.compile(r'^\[\[[^\]]+\]\]\s*$', re.MULTILINE),        # 独占一行的 wiki 链接
]

# ── 内联替换 ────────────────────────────────────────────────────────────
INLINE_RULES = [
    (re.compile(r'\[\[([^\]]+)\]\]'), r'\1'),  # wiki 链接 → 纯文字
]


def _is_ocr_garbage(line: str) -> bool:
    """行内无汉字、长度 < 20、且非 markdown 结构，判定为 OCR 乱码"""
    s = line.strip()
    if not s or s.startswith('#') or s.startswith('|') or s == '---':
        return False
    if len(s) >= 20:
        return False
    has_cjk = any('一' <= c <= '鿿' for c in s)
    return not has_cjk


def clean(text: str) -> str:
    # 整块删除
    for rule in BLOCK_RULES:
        text = rule.sub('', text)

    # 单行删除
    for rule in LINE_RULES:
        text = rule.sub('', text)

    # 内联替换
    for pattern, repl in INLINE_RULES:
        text = pattern.sub(repl, text)

    # OCR 乱码行（逐行过滤）
    lines = text.splitlines()
    text = '\n'.join(l for l in lines if not _is_ocr_garbage(l))

    # 重复标题（连续出现的相同标题只保留一个）
    text = re.sub(r'^(#{1,6} .+)\n+\1\n', r'\1\n', text, flags=re.MULTILINE)

    # 连续分隔符 → 保留一个
    text = re.sub(r'(\n---\n){2,}', '\n---\n', text)

    # 3 个以上空行 → 2 个空行
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def main():
    md_files = list(RAW_DIR.rglob("*.md"))
    print(f"共 {len(md_files)} 个文件，开始清洗…\n")

    for md in sorted(md_files):
        rel = md.relative_to(RAW_DIR)
        out = OUT_DIR / rel
        out.parent.mkdir(parents=True, exist_ok=True)

        text = md.read_text(encoding='utf-8', errors='ignore')
        original_len = len(text)
        cleaned = clean(text)
        reduction = (original_len - len(cleaned)) / original_len * 100 if original_len else 0

        out.write_text(cleaned, encoding='utf-8')
        print(f"✓ {rel}  (-{reduction:.0f}%)")

    print(f"\n完成！输出目录：{OUT_DIR}")


if __name__ == "__main__":
    main()
