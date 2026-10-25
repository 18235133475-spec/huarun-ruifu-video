# 把描摹户型（1号楼方向）镜像成2号楼方向，导出平面矢量数据给样帧用。只读源文件。
# 坐标：x 向东、y 向南（与 SVG 同向，上北下南），单位米。
import json, re, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
W = d['meta']['width']
mx = lambda p: [round(W - p[0], 4), round(p[1], 4)]
swap = lambda s: re.sub('西侧|东侧', lambda m: {'西侧': '东侧', '东侧': '西侧'}[m[0]], s)
res = {
    'width': W, 'depth': d['meta']['depth'],
    'rooms': [{'id': r['id'], 'name': swap(r['name']), 'category': r['category'], 'polygon': [mx(p) for p in r['polygon']]} for r in d['rooms']],
    'walls': [{'a': mx(w['a']), 'b': mx(w['b']), 't': w['thickness'], 'ext': w['exterior'], 'role': w['displayRole']} for w in d['walls']],
    'solids': [{'polygon': [mx(p) for p in s['polygon']], 'holes': [[mx(p) for p in h] for h in s.get('holes', [])]} for s in d['solidFootprints']],
    'furniture': [{'type': f['type'], 'room': f['roomId'], 'pos': mx(f['position']), 'size': f['size'][:2], 'rot': -float(f.get('rotation', 0))} for f in d['furniture']],
}
json.dump(res, open(out, 'w'), ensure_ascii=False)
print('rooms', len(res['rooms']), 'walls', len(res['walls']), 'solids', len(res['solids']), 'furniture', len(res['furniture']))
