# 把动图插到文章对应段落之后：图片段落沿用原文图片的版式（14.6cm 宽、居中），下面一行沿用原文图注样式。
# 用法：python3 insert_gifs.py <解包目录> <动图目录>
import os, re, shutil, sys
from PIL import Image

D, G = sys.argv[1], sys.argv[2]
ITEMS = [  # (动图编号, 插在含这句话的段落之后, 图注)
    ("01", "最北边的两栋，却转了个身，一起转向了西南。", "动图｜最北侧的1、2号楼，一起转向西南"),
    ("02", "能一直走到晋阳湖的方向。", "动图｜转过身，和园在眼前，远处是晋阳湖"),
    ("03", "围着这栋楼排了一圈。", "动图｜山、河、湖、园、馆、城，围着这两栋楼"),
    ("04", "二十多年前，这里是一片麦田。", "动图｜二十多年前，这里还是一片田地"),
    ("05", "是从汾河引进来的。", "动图｜平台整体抬起，车在下面穿行，人在上面漫步"),
    ("06", "自己独占一个单元。", "动图｜2号楼东单元，每层只有一套355㎡"),
    ("07", "电梯里碰见的，也都是自家人。", "动图｜两梯一户，电梯门一开就是自家的玄关厅"),
    ("08", "它跟着你在家里的位置换。", "动图｜午后看园，傍晚围坐，入夜看城"),
    ("09", "是风景在陪你。", "动图｜站在窗前看风景，坐回厅里，风景陪着你"),
    ("10", "一天就在这一侧慢慢收拢。", "动图｜起床、沐浴、选衣、着装，不必穿过公共区域"),
    ("11", "不吃老本。", "动图｜楼栋一批批落成，每次加推都重新想一遍"),
    ("12", "往大，往少。", "动图｜同样的面积，分给更少的户数"),
    ("13", "瑞府的楼王，为太原转了个身。", "动图｜入夜的长风，和转过身的1、2号楼"),
]
W_EMU = 5266690  # 和原文图片同宽

doc = os.path.join(D, "word/document.xml")
x = open(doc, encoding="utf-8").read()
paras = list(re.finditer(r"<w:p[ >].*?</w:p>", x, flags=re.S))
text = lambda p: "".join(re.findall(r"<w:t(?: [^>]*)?>([^<]*)</w:t>", p))

# 图注样式：照抄原文第一张图下面那段图注的段落和字符属性
cap_par = next(m.group(0) for m in paras if "项目鸟瞰效果示意" in text(m.group(0)))
cap_ppr = re.search(r"<w:pPr>.*?</w:pPr>", cap_par, flags=re.S).group(0)
cap_rpr = re.search(r"<w:r><w:rPr>(.*?)</w:rPr>", cap_par, flags=re.S).group(1)

rels_p = os.path.join(D, "word/_rels/document.xml.rels")
rels = open(rels_p, encoding="utf-8").read()
ids = [int(i) for i in re.findall(r'Id="rId(\d+)"', rels)]
doc_ids = [int(i) for i in re.findall(r'<wp:docPr id="(\d+)"', x)]
rid, did = max(ids) + 100, max(doc_ids) + 100
os.makedirs(os.path.join(D, "word/media"), exist_ok=True)

inserts = []  # (插入位置, xml)
for n, anchor, cap in ITEMS:
    hit = [m for m in paras if anchor in text(m.group(0))]
    assert len(hit) == 1, (n, anchor, len(hit))
    src = os.path.join(G, f"g{n}.gif")
    shutil.copy(src, os.path.join(D, f"word/media/gif{n}.gif"))
    w, h = Image.open(src).size
    cy = round(W_EMU * h / w)
    rid += 1; did += 1
    rels = rels.replace("</Relationships>", f'<Relationship Id="rId{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/gif{n}.gif"/></Relationships>')
    pic = (f'<w:p><w:pPr><w:spacing w:before="120" w:after="80"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'
           f'<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{W_EMU}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
           f'<wp:docPr id="{did}" name="动图 {n}" descr="{cap}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
           f'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
           f'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="{did}" name="动图 {n}" descr="{cap}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>'
           f'<pic:blipFill><a:blip r:embed="rId{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
           f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{W_EMU}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
           f'</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')
    capx = f"<w:p>{cap_ppr}<w:r><w:rPr>{cap_rpr}</w:rPr><w:t>{cap}</w:t></w:r></w:p>"
    inserts.append((hit[0].end(), pic + capx))

for pos, xml in sorted(inserts, reverse=True):
    x = x[:pos] + xml + x[pos:]
open(doc, "w", encoding="utf-8").write(x)
open(rels_p, "w", encoding="utf-8").write(rels)
ct_p = os.path.join(D, "[Content_Types].xml")
ct = open(ct_p, encoding="utf-8").read()
if 'Extension="gif"' not in ct:
    ct = ct.replace("<Default ", '<Default Extension="gif" ContentType="image/gif"/><Default ', 1)
    open(ct_p, "w", encoding="utf-8").write(ct)
print("inserted", len(inserts))
