"""
第三步：对 cleaned-data 中每个分类目录内的文件做段落级去重（精确 + 轻量模糊）。
直接覆盖写回 cleaned-data/（原 raw-data 不动）。
用法：python scripts/dedup_md.py
"""
import hashlib
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

CLEANED_DIR = Path(__file__).resolve().parent.parent.parent.parent / "cleaned-data"

MIN_PARA_LEN = 30  # 短于此长度的段落不参与去重（保留标题、小标签等）


def _hash(text: str) -> str:
    """规范化空白后取 md5，用于精确匹配"""
    normalized = re.sub(r'\s+', ' ', text.strip())
    return hashlib.md5(normalized.encode()).hexdigest()


def _ngrams(text: str, n: int = 4) -> set[str]:
    """字符 n-gram，用于模糊相似度估算"""
    return {text[i:i+n] for i in range(len(text) - n + 1)}


def _is_near_duplicate(para: str, seen_paras: list[str], threshold: float = 0.85) -> bool:
    """Jaccard 相似度 > threshold 则视为近重复（只对较长段落检测）"""
    if len(para) < 80:
        return False
    a = _ngrams(para)
    for p in seen_paras[-200:]:  # 只和最近 200 个段落比较，避免 O(n²) 过慢
        b = _ngrams(p)
        if not a and not b:
            continue
        jaccard = len(a & b) / len(a | b)
        if jaccard >= threshold:
            return True
    return False


def dedup_text(text: str, exact_seen: set, fuzzy_seen: list) -> tuple[str, int, int]:
    """返回 (去重后文本, 精确去重数, 模糊去重数)"""
    paras = re.split(r'\n{2,}', text)
    kept: list[str] = []
    exact_removed = fuzzy_removed = 0

    for para in paras:
        stripped = para.strip()
        if len(stripped) < MIN_PARA_LEN:
            kept.append(para)
            continue

        h = _hash(stripped)
        if h in exact_seen:
            exact_removed += 1
            continue

        if _is_near_duplicate(stripped, fuzzy_seen):
            fuzzy_removed += 1
            exact_seen.add(h)  # 也加入精确集，避免重复判断
            continue

        exact_seen.add(h)
        fuzzy_seen.append(stripped)
        kept.append(para)

    return '\n\n'.join(kept), exact_removed, fuzzy_removed


def main():
    for category_dir in sorted(CLEANED_DIR.iterdir()):
        if not category_dir.is_dir():
            continue

        exact_seen: set[str] = set()
        fuzzy_seen: list[str] = []
        total_exact = total_fuzzy = 0

        for md in sorted(category_dir.rglob("*.md")):
            text = md.read_text(encoding='utf-8', errors='ignore')
            deduped, n_exact, n_fuzzy = dedup_text(text, exact_seen, fuzzy_seen)
            md.write_text(deduped, encoding='utf-8')
            total_exact += n_exact
            total_fuzzy += n_fuzzy

        print(f"✓ {category_dir.name}：精确去重 {total_exact} 段，模糊去重 {total_fuzzy} 段")

    print("\n完成！")


if __name__ == "__main__":
    main()
