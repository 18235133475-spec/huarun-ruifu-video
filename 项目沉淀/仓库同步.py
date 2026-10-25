"""从本机工作区生成精选的 GitHub 仓库 `华润瑞府/_GitHub仓库/`。

工作区是唯一的源头；仓库只收整理过的内容（沉淀文档、可公开的资产、动画工程源码、成果、精选过程档案）。
文件用硬链接（不占额外磁盘）；仓库专用的说明文件在 项目沉淀/仓库模板/ 里维护。
用法：python3 华润瑞府/项目沉淀/仓库同步.py
"""
import fnmatch, os, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 华润瑞府/
REPO = ROOT / "_GitHub仓库"
TPL = ROOT / "项目沉淀" / "仓库模板"
V = ROOT / "视频"
SKIP = {".DS_Store", "__pycache__", ".venv", "node_modules", ".cache"}

def put(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists(): dst.unlink()
    os.link(src, dst)

def tree(src: Path, dst: Path, include=("*",), exclude=()):
    """把 src 目录下匹配 include、不匹配 exclude 的文件（相对路径匹配）链接到 dst。"""
    for p in sorted(src.rglob("*")):
        rel = p.relative_to(src)
        if p.is_dir() or any(part in SKIP for part in rel.parts): continue
        r = rel.as_posix()
        if any(fnmatch.fnmatch(r, pat) for pat in include) and not any(fnmatch.fnmatch(r, pat) for pat in exclude):
            put(p, dst / rel)

# 先清空仓库里除 .git 以外的内容，保证删掉的文件不残留
REPO.mkdir(exist_ok=True)
for p in REPO.iterdir():
    if p.name == ".git": continue
    shutil.rmtree(p) if p.is_dir() else p.unlink()

# 仓库专用文件：根目录 README、AGENTS、.gitignore，各分区的 README
tree(TPL, REPO)

# 项目沉淀（不含模板目录本身）
tree(ROOT / "项目沉淀", REPO / "项目沉淀", exclude=("仓库模板/*",))

# 资产库：只收可公开的部分（03 甲方衍生不进）
tree(ROOT / "资产库", REPO / "资产库", exclude=("03_*",))

# 动画工程：源码、工具脚本、依赖清单（数据与模型见资产库；甲方衍生资产、配音、渲染输出不进）
E = V / "动画工程"
tree(E / "src", REPO / "动画工程" / "src")
tree(E / "tools", REPO / "动画工程" / "tools", include=("*.py", "*/*.py"))
for f in ("package.json", "package-lock.json", "tsconfig.json"):
    put(E / f, REPO / "动画工程" / f)

# 成果：文章正文（由 Word 转出，不含图片）、配音稿、文章动图（g04 用了谷歌地球影像，不收）
out = REPO / "成果"
(out / "文章正文.md").parent.mkdir(parents=True, exist_ok=True)
md = subprocess.run(["pandoc", "-t", "gfm", "--wrap=none", str(V / "文章配图" / "原文_一栋楼为太原转身.docx")], capture_output=True, text=True, check=True).stdout
lines = [l for l in md.splitlines() if not l.lstrip().startswith(("<img", "![")) and "media/image" not in l]
(out / "文章正文.md").write_text("# 一栋楼，为太原转了个身\n\n> 公众号正文（由 Word 稿转出；原稿配图为甲方效果图与分析图，不收入仓库，只保留图注）。\n\n" + "\n".join(lines).strip() + "\n", encoding="utf-8")
put(V / "太原瑞府_v8配音稿.md", out / "配音稿.md")
tree(V / "文章配图" / "动图", out / "动图", include=("*.gif",), exclude=("g04.gif",))

# 过程档案：视频方案与审查、任务书与验收（只收文档）、定稿风格样帧、写作阶段分析与原创概念图
arc = REPO / "过程档案"
tree(V, arc / "视频方案与审查", include=("HR-VIDEO-*.md",), exclude=("*/*", "HR-VIDEO-SRC-*"))
tree(V / "任务书", arc / "任务书与验收", include=("*.md",), exclude=("*/*", "*备份*"))
tree(V / "风格样帧" / "第三版", arc / "定稿风格样帧", include=("*.png", "*.jpg"))
tree(ROOT / "文章拆解", arc / "写作阶段" / "文章拆解", include=("*.md",))
tree(ROOT / "概念配图", arc / "写作阶段" / "原创概念图", include=("*.png", "*.svg", "*.jpg", "*.md"), exclude=("*/*",))

n = sum(1 for p in REPO.rglob("*") if p.is_file() and ".git" not in p.parts)
size = sum(p.stat().st_size for p in REPO.rglob("*") if p.is_file() and ".git" not in p.parts)
print(f"仓库已生成：{n} 个文件，{size / 1e6:.1f} MB → {REPO}")
