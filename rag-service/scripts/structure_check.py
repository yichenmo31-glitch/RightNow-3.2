"""
第二步：检查 cleaned-data 中每个文件的内容是否与其所在分类目录匹配。
输出疑似归类错误的文件列表。
用法：python scripts/structure_check.py
"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

CLEANED_DIR = Path(__file__).resolve().parent.parent.parent.parent / "cleaned-data"

# 每个分类的关键词（高频词越靠前权重越高）
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "运动学":       ["生物力学", "生物能量", "运动学", "力矩", "旋转轴", "运动平面", "肌纤维", "心血管"],
    "营养学":       ["营养", "蛋白质", "碳水化合物", "脂肪", "维生素", "矿物质", "热量", "膳食"],
    "肌理学":       ["肌动学", "关节", "肌力", "运动链", "力臂", "关节运动学", "骨骼运动"],
    "测试与评估":   ["测试", "评估", "测量", "1RM", "最大力量", "体能", "指标"],
    "训练与实操":   ["训练计划", "超负荷", "渐进", "组数", "次数", "周期", "力量训练"],
    "心理与康复":   ["心理", "康复", "动机", "压力", "睡眠", "损伤", "恢复"],
    "生活化减脂内核": ["减脂", "热量赤字", "分化", "新手", "一分化", "三分化", "训练频率"],
}

READ_CHARS = 4000  # 只读文件前 N 字符做判断


def score(text: str, keywords: list[str]) -> int:
    return sum(text.count(k) for k in keywords)


def check_file(md: Path) -> tuple[str, str] | None:
    """返回 (文件相对路径, 疑似正确分类)，若无问题返回 None"""
    parts = md.relative_to(CLEANED_DIR).parts
    if not parts or parts[0] not in CATEGORY_KEYWORDS:
        return None

    category = parts[0]
    text = md.read_text(encoding='utf-8', errors='ignore')[:READ_CHARS]

    scores = {cat: score(text, kws) for cat, kws in CATEGORY_KEYWORDS.items()}
    best = max(scores, key=lambda c: scores[c])

    # 最高分类不是当前分类，且差距明显（避免噪音误判）
    if best != category and scores[best] > max(scores[category] * 1.5, 5):
        return str(md.relative_to(CLEANED_DIR)), best

    return None


def main():
    mismatches: list[tuple[str, str]] = []

    for md in sorted(CLEANED_DIR.rglob("*.md")):
        result = check_file(md)
        if result:
            mismatches.append(result)

    if not mismatches:
        print("✓ 所有文件归类正常")
    else:
        print(f"⚠ 发现 {len(mismatches)} 个疑似归类错误：\n")
        for path, suggested in mismatches:
            print(f"  {path}")
            print(f"    → 疑似属于「{suggested}」\n")


if __name__ == "__main__":
    main()
