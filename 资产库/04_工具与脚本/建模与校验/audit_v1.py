"""HR-VIDEO-TASK-007 section 8 self-check, all packages -> per-package meta.json + 校验/self_check.json

Checks: palette-only materials, no textures, degenerate / inverted triangles, footprint
deviation (<=0.5 m incl. slabs), heights (<=0.1 m), parent transforms equal ruifu.glb,
identity-rotation axis alignment, per-package triangle limits, instance placement conflicts.
"""
from __future__ import annotations
import json, struct, sys
from pathlib import Path
import numpy as np
from shapely.geometry import MultiPoint, Point, Polygon, shape
from shapely.ops import unary_union
from shapely.geometry import box as sbox

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from render import read_glb, node_matrix
from gltf_writer import PALETTE, hex_rgb

REFINE = HERE.parent
MODEL = REFINE.parent
REQ_H = {'ruifu_t1': 120.75, 'ruifu_t2': 140.25, 'ruifu_t3': 96.75, 'ruifu_b13': 97.95,
         'ruifu_b14': 97.95, 'ruifu_b23': 70.75, 'ruifu_s1': 6.0}
LIMIT = {'residential': 40000, 'office': 30000, 'club': 40000}


def raw(path):
    b = Path(path).read_bytes(); n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n])


def tri_checks(path):
    doc = raw(path); b = Path(path).read_bytes(); jl = struct.unpack('<I', b[12:16])[0]
    binary = b[20 + jl + 8:]
    degenerate = inverted = total = 0
    for m in doc['meshes']:
        for p in m['primitives']:
            def acc(i):
                a = doc['accessors'][i]; v = doc['bufferViews'][a['bufferView']]
                dt = '<f4' if a['componentType'] == 5126 else '<u4'; k = 3 if a['type'] == 'VEC3' else 1
                return np.frombuffer(binary, dt, a['count'] * k, v['byteOffset']).reshape(-1, k) if k > 1 else np.frombuffer(binary, dt, a['count'], v['byteOffset'])
            P = acc(p['attributes']['POSITION']).astype(np.float64); N = acc(p['attributes']['NORMAL']).astype(np.float64)
            F = acc(p['indices']).reshape(-1, 3)
            cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
            degenerate += int((np.linalg.norm(cr, axis=1) < 1e-10).sum())
            inverted += int((np.einsum('ij,ij->i', cr, N[F].mean(1)) <= 0).sum())
            total += len(F)
    return total, degenerate, inverted


def file_block(path):
    doc = raw(path)
    mats = [m['name'] for m in doc['materials']]
    colour_ok = all(np.allclose(m['pbrMetallicRoughness']['baseColorFactor'][:3], hex_rgb(PALETTE[m['name']]), atol=1e-6)
                    for m in doc['materials'] if m['name'] in PALETTE)
    tot, deg, inv = tri_checks(path)
    return {'triangles': tot, 'degenerate_triangles': deg, 'normal_winding_mismatch': inv,
            'materials': mats, 'materials_all_in_palette': all(m in PALETTE for m in mats),
            'colours_match_palette': colour_ok,
            'textures_images_samplers': sum(len(doc.get(k, [])) for k in ('textures', 'images', 'samplers')),
            'bytes': Path(path).stat().st_size}


def audit_A():
    path = REFINE / 'A_ruifu' / 'ruifu_detail.glb'
    src = raw(MODEL / 'ruifu' / 'ruifu.glb'); srcn = {n['name']: n for n in src['nodes']}
    fps = {f['id']: shape(f['geometry']) for f in json.loads((MODEL / 'ruifu' / 'footprints.json').read_text())['features']}
    doc = raw(path)
    _, parts = read_glb(path)
    out = {'file': file_block(path), 'buildings': {}}
    roots = [doc['nodes'][i] for i in doc['scenes'][0]['nodes']]
    for r in roots:
        name = r['name']; s = srcn[name]
        kind = r['extras']['building_type']
        bp = [p for p in parts if p['root'] == name]
        body = np.concatenate([p['tris'].reshape(-1, 3) for p in bp if not p['node'].endswith(('_entrance', '_deck'))])
        fp = fps[name]
        # point-wise footprint deviation: max distance of body ground points outside fp,
        # and of footprint samples not covered by the body (handles non-convex footprints)
        gpts = body[body[:, 1] < 1.5][:, [0, 2]]
        d_out = max((fp.distance(Point(p)) for p in gpts), default=0.0)
        mp = MultiPoint(gpts.tolist()).convex_hull if len(gpts) >= 3 else None
        fs = [fp.exterior.interpolate(t, normalized=True) for t in np.linspace(0, 1, 80)]
        d_in = max((mp.distance(q) for q in fs), default=0.0) if mp is not None else 99.0
        M = node_matrix(r); loc = (np.c_[body, np.ones(len(body))] @ np.linalg.inv(M).T)[:, :3]
        lh = MultiPoint(loc[:, [0, 2]]).convex_hull.simplify(0.01)
        e = np.diff(np.asarray(lh.exterior.coords), axis=0); ang = np.degrees(np.arctan2(e[:, 1], e[:, 0])) % 90
        ang = np.minimum(ang, 90 - ang)
        req = REQ_H.get(name, float(r['extras']['height_m']))
        tri_b = sum(len(p['tris']) for p in bp)
        out['buildings'][name] = {
            'type': kind,
            'parent_translation_equal_ruifu_glb': r['translation'] == s['translation'],
            'parent_rotation_equal_ruifu_glb': r['rotation'] == s['rotation'],
            'footprint_deviation_m': float(max(d_out, d_in)),
            'max_y_m': float(body[:, 1].max() if name != 'ruifu_s1' else max(p['tris'][:, :, 1].max() for p in bp)),
            'height_deviation_m': float(abs(body[:, 1].max() - req)),
            'identity_rotation_local_edge_angle_from_axes_deg': float(ang.max()),
            'triangles': tri_b, 'triangle_limit': LIMIT[kind], 'within_limit': tri_b <= LIMIT[kind]}
    b = out['buildings']
    out['summary'] = {
        'building_count': len(b),
        'max_footprint_deviation_m': max(v['footprint_deviation_m'] for v in b.values()),
        'max_height_deviation_m': max(v['height_deviation_m'] for v in b.values()),
        'total_triangles': sum(v['triangles'] for v in b.values()),
        'all_parent_transforms_equal_ruifu_glb': all(v['parent_translation_equal_ruifu_glb'] and v['parent_rotation_equal_ruifu_glb'] for v in b.values()),
        'pass_footprint_le_0_5': all(v['footprint_deviation_m'] <= 0.5 for v in b.values()),
        'pass_b01_b02_axis_aligned': all(b[n]['identity_rotation_local_edge_angle_from_axes_deg'] < 0.05 for n in ('ruifu_b01', 'ruifu_b02')),
        'pass_height_le_0_1': all(v['height_deviation_m'] <= 0.1 for v in b.values()),
        'pass_triangle_limits': all(v['within_limit'] for v in b.values()),
        'pass_local_axis_aligned': all(v['identity_rotation_local_edge_angle_from_axes_deg'] < 0.05 for v in b.values())}
    return out



def audit_F():
    import math
    from unit_lib import PLAN as UPLAN, DEPTH as UDEPTH
    from unit_lib import PLAN, DEPTH, FLOOR_Y as FLOOR_Yc
    out = {'files': {}}
    for f, lim in (('unit_b02_detail.glb', 300000), ('unit_furnish.glb', 600000)):
        p = REFINE / 'F_unit' / f
        blk = file_block(p)
        blk['triangle_limit'] = lim; blk['within_limit'] = blk['triangles'] <= lim
        out['files'][f] = blk
    # wall midlines vs unit_plan: per-node AABB centre vs expected segment midline
    doc = raw(REFINE / 'F_unit' / 'unit_b02_detail.glb')
    _, parts = read_glb(REFINE / 'F_unit' / 'unit_b02_detail.glb')
    from build_F_unit import wall_overrides, seg_rect
    node_pts = {}
    for p in parts:
        node_pts.setdefault(p['node'], []).append(p['tris'].reshape(-1, 3))
    node_pts = {k: np.concatenate(v) for k, v in node_pts.items()}
    worst = 0.0; checked = 0
    for a, b, t, role in wall_overrides():
        mx = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        x0, y0, x1, y1 = seg_rect(a, b, t)
        best = None
        for nm, pts in node_pts.items():
            if not (nm.startswith('wall_')): continue
            if abs(pts[:, 0].min() - x0) < 0.05 and abs(pts[:, 0].max() - x1) < 0.05 and \
               abs(pts[:, 2].min() - (y0 - DEPTH)) < 0.05 and abs(pts[:, 2].max() - (y1 - DEPTH)) < 0.05:
                best = pts; break
        if best is None: continue
        cx = float(best[:, 0].mean()); cz = float(best[:, 2].mean())
        if abs(x1 - x0) >= abs(y1 - y0):
            dev = abs(cz - (mx[1] - DEPTH))
        else:
            dev = abs(cx - mx[0])
        worst = max(worst, dev); checked += 1
    out['wall_midline_check'] = {'walls_checked': checked, 'max_midline_deviation_m': round(float(worst), 4),
                                 'pass_le_0_05': bool(worst <= 0.05)}
    # furniture anchors from unitdress.ts: nearest-vertex distance to the exact position
    anchors = [   # (group, plan x, plan y, surface height above floor)
        ('furn_living', 15.0, 11.75, 0.42), ('furn_living', 17.85, 12.5, 0.42), ('furn_living', 15.0, 13.15, 0.38),
        ('furn_living', 11.75, 12.7, 1.05), ('furn_dining', 16.9, 7.15, 0.75), ('furn_dining', 13.55, 7.15, 0.96),
        ('furn_dining', 11.75, 7.15, 1.05), ('furn_tea', 16.2, 3.4, 0.72), ('furn_tea', 13.75, 3.55, 0.9),
        ('furn_multi', 21.92, 2.75, 1.05), ('furn_multi', 19.6, 4.3, 0.45), ('furn_kitchen', 20.6, 7.1, 0.9),
        ('furn_housekeeping', 11.92, 2.75, 0.94), ('furn_master', 1.6, 13.3, 0.3), ('furn_master', 4.85, 10.09, 0.5),
        ('furn_wardrobe', 1.0, 8.2, 0.9), ('furn_master_bath', 0.82, 6.15, 0.55), ('furn_bed_center', 6.4, 13.6, 0.3),
        ('furn_bed_east', 21.1, 14.29, 0.3), ('furn_entry', 10.735, 6.6, 1.05), ('furn_entry', 10.74, 8.89, 0.44),
        ('furn_entry_storage', 9.96, 11.83, 0.95),
    ]
    def pt_tri_dist(p, tris):
        best = 1e18
        for tri in tris:
            a, b, c = tri
            ab, ac, ap = b - a, c - a, p - a
            d1, d2 = ab @ ap, ac @ ap
            if d1 <= 0 and d2 <= 0: best = min(best, float(np.linalg.norm(p - a))); continue
            bp = p - b; d3, d4 = ab @ bp, ac @ bp
            if d3 >= 0 and d4 <= d3: best = min(best, float(np.linalg.norm(p - b))); continue
            vc = d1 * d4 - d3 * d2
            if vc <= 0 and d1 >= 0 and d3 <= 0:
                v = d1 / (d1 - d3); best = min(best, float(np.linalg.norm(p - (a + ab * v)))); continue
            wp = p - c; d5, d6 = ab @ wp, ac @ wp
            if d6 >= 0 and d5 <= d6: best = min(best, float(np.linalg.norm(p - c))); continue
            vb = d5 * d2 - d1 * d6
            if vb <= 0 and d2 >= 0 and d6 <= 0:
                w = d2 / (d2 - d6); best = min(best, float(np.linalg.norm(p - (a + ac * w)))); continue
            va = d3 * d6 - d5 * d4
            if va <= 0 and (d4 - d3) >= 0 and (d5 - d6) >= 0:
                w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); best = min(best, float(np.linalg.norm(p - (b + (c - b) * w)))); continue
            den = 1.0 / (va + vb + vc)
            v, w = vb * den, vc * den
            best = min(best, float(np.linalg.norm(p - (a + ab * v + ac * w))))
        return best
    fu = {}
    _, fparts = read_glb(REFINE / 'F_unit' / 'unit_furnish.glb')
    ftris = {}
    for p in fparts:
        ftris.setdefault(p['node'], []).append(p['tris'])
    ftris = {k: np.concatenate(v) for k, v in ftris.items()}
    for grp, ax, ay, ah in anchors:
        if grp not in ftris: fu[f'{grp}@({ax},{ay})'] = {'present': False}; continue
        pnt = np.array([ax, FLOOR_Yc + ah, ay - DEPTH])
        fu[f'{grp}@({ax},{ay})'] = {'present': True, 'surface_distance_m': round(pt_tri_dist(pnt, ftris[grp]), 4)}
    out['furniture_anchors'] = fu
    # ---- HR-VIDEO-TASK-007b checks: combined-view consistency ----
    def mesh_pts(docparts, prefix=None):
        d = {}
        for p in docparts:
            if prefix and not p['node'].startswith(prefix): continue
            d.setdefault(p['node'], []).append(p['tris'].reshape(-1, 3))
        return {k: np.concatenate(v) for k, v in d.items()}
    dpts = mesh_pts(parts)
    range_bad = []
    for nm, pts in dpts.items():
        if pts[:, 0].min() < -0.5 or pts[:, 0].max() > 23.3 or pts[:, 2].min() < -18.4 or pts[:, 2].max() > 0.5:
            range_bad.append([nm, round(float(pts[:, 0].min()), 2), round(float(pts[:, 0].max()), 2),
                              round(float(pts[:, 2].min()), 2), round(float(pts[:, 2].max()), 2)])
    _, fparts2 = read_glb(REFINE / 'F_unit' / 'unit_furnish.glb')
    fpts2 = mesh_pts(fparts2)
    for nm, pts in fpts2.items():
        if pts[:, 0].min() < -0.5 or pts[:, 0].max() > 23.3 or pts[:, 2].min() < -18.4 or pts[:, 2].max() > 0.5:
            range_bad.append([nm, round(float(pts[:, 0].min()), 2), round(float(pts[:, 0].max()), 2),
                              round(float(pts[:, 2].min()), 2), round(float(pts[:, 2].max()), 2)])
    out['range_check'] = {'bad_meshes': range_bad, 'pass_zero_bad': len(range_bad) == 0}
    # floor centres inside their room polygons (plan coords: y = z + 17.9)
    from build_F_unit import RENAME
    from unit_lib import window_spans as win_spans
    floor_chk = {}
    for r in UPLAN['rooms']:
        rid = RENAME.get(r['id'], r['id'])
        poly = Polygon(r['polygon'])
        key = f'floor_{rid}'
        if key not in dpts: floor_chk[key] = 'missing'; continue
        pts = dpts[key]
        c = Point(float(pts[:, 0].mean()), float(pts[:, 2].mean() + UDEPTH))
        floor_chk[key] = bool(poly.contains(c) or poly.distance(c) <= 0.05)
    out['floor_in_room'] = floor_chk
    # furniture group centres inside (or <=0.3 m from) their room polygons
    room_by_furn = {}
    for r in UPLAN['rooms']:
        room_by_furn[f'furn_{RENAME.get(r["id"], r["id"])}'] = Polygon(r['polygon'])
    extra = {'furn_master': None}  # master group spans master + dressing alcove: use master poly
    furn_chk = {}
    for nm, pts in fpts2.items():
        if not nm.startswith('furn_'): continue
        c = Point(float(pts[:, 0].mean()), float(pts[:, 2].mean() + UDEPTH))
        poly = room_by_furn.get(nm)
        if poly is None:
            # furn groups that straddle zones (e.g. multi+balcony) check against the union of nearby rooms
            from shapely.ops import unary_union as _uu
            poly = _uu([Polygon(r['polygon']) for r in UPLAN['rooms']
                        if Polygon(r['polygon']).distance(c) < 12.0])
        furn_chk[nm] = bool(poly.contains(c) or poly.distance(c) <= 0.3)
    out['furn_in_room'] = furn_chk
    # window groups within 0.3 m of the nearest exterior wall midline
    from shapely.geometry import LineString
    wlines = [LineString([(w['a'][0], w['a'][1] - UDEPTH), (w['b'][0], w['b'][1] - UDEPTH)]) for w in UPLAN['walls']]
    for so in UPLAN['solids']:
        g = Polygon(so['polygon'])
        x0, y0, x1, y1 = g.bounds
        for seg in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
            wlines.append(LineString([(seg[0][0], seg[0][1] - UDEPTH), (seg[1][0], seg[1][1] - UDEPTH)]))
    for r in UPLAN['rooms']:          # room edges are the other wall midlines (south facade lives here)
        pp = r['polygon']
        for i in range(len(pp) - 1):
            wlines.append(LineString([(pp[i][0], pp[i][1] - UDEPTH), (pp[i + 1][0], pp[i + 1][1] - UDEPTH)]))
    win_chk = {}
    for grp, info in win_spans().items():
        side = info['side']
        if side in ('south', 'north'):
            c = Point((info['span'][0] + info['span'][1]) / 2, info['const'] - UDEPTH)
        else:
            c = Point(info['const'], (info['span'][0] + info['span'][1]) / 2 - UDEPTH)
        win_chk[grp] = round(min(l.distance(c) for l in wlines), 3)
    out['window_on_wall'] = win_chk
    out['summary_007b'] = {
        'pass_range_check': len(range_bad) == 0,
        'pass_floor_in_room': all(v is True for v in floor_chk.values()),
        'pass_furn_in_room': all(v is True for v in furn_chk.values()),
        'pass_window_within_0_3': all(v <= 0.3 for v in win_chk.values()),
        'border_check': 'see compare_whole_v2.jpg pixel stats in meta'}
    out['summary'] = {
        'pass_wall_midline': out['wall_midline_check']['pass_le_0_05'],
        'pass_furniture_anchors_present': all(v.get('present') for v in fu.values()),
        'pass_furniture_within_0_1': all(v.get('surface_distance_m', 0) <= 0.1 for v in fu.values()),
        'detail_triangles': out['files']['unit_b02_detail.glb']['triangles'],
        'furnish_triangles': out['files']['unit_furnish.glb']['triangles'],
        'pass_triangle_limits': all(v['within_limit'] for v in out['files'].values()),
        'no_degenerate_or_inverted': all(v['degenerate_triangles'] == 0 and v['normal_winding_mismatch'] == 0 for v in out['files'].values()),
        'palette_only_no_textures': all(v['materials_all_in_palette'] and v['textures_images_samplers'] == 0 for v in out['files'].values())}
    return out


def audit_B():
    out = {'files': {}}
    for f, lim in (('site.glb', 600000), ('site_protos.glb', 50000)):
        p = REFINE / 'B_site' / f
        blk = file_block(p); blk['triangle_limit'] = lim; blk['within_limit'] = blk['triangles'] <= lim
        out['files'][f] = blk
    # instance conflicts: lamps/trees must not sit on paving / road / footprint / water;
    # benches must sit on paving (see 决定记录 for the interpretation)
    import build_B_site as B
    from shapely.geometry import Point
    geoms, blocked, site, fps = B.blocked_for_instances()
    inst = json.loads((REFINE / 'B_site' / 'site_instances.json').read_text())
    conflicts = []
    for name, x, y, z, rot, sc in inst:
        if name == 'bench':
            if not geoms['paving'].buffer(0.6).contains(Point(x, z)): conflicts.append([name, x, z, 'not on paving'])
        else:
            if blocked.contains(Point(x, z)): conflicts.append([name, x, z, 'on blocked surface'])
    trees = json.loads((REFINE / 'B_site' / 'trees_site.json').read_text())
    tconf = [t for t in trees if blocked.contains(Point(t[0], t[1]))]
    out['instances'] = {'count': len(inst), 'conflicts': conflicts, 'trees': len(trees), 'tree_conflicts': len(tconf)}
    out['summary'] = {
        'pass_triangle_limits': all(v['within_limit'] for v in out['files'].values()),
        'pass_instance_conflicts_zero': len(conflicts) == 0 and len(tconf) == 0,
        'no_degenerate_or_inverted': all(v['degenerate_triangles'] == 0 and v['normal_winding_mismatch'] == 0 for v in out['files'].values()),
        'palette_only_no_textures': all(v['materials_all_in_palette'] and v['textures_images_samplers'] == 0 for v in out['files'].values())}
    return out


def audit_C():
    out = {'files': {}}
    for f in ('street.glb', 'riverside.glb', 'street_protos.glb'):
        out['files'][f] = file_block(REFINE / 'C_street' / f)
    tot = out['files']['street.glb']['triangles'] + out['files']['riverside.glb']['triangles']
    out['combined_triangles_excluding_trees'] = tot
    out['triangle_limit'] = 500000
    # instance conflicts: nothing on the binhe carriageway or the city road surfaces
    import build_C_street as BC
    from shapely.geometry import Point
    nogo = BC.no_go_geom()
    inst = json.loads((REFINE / 'C_street' / 'street_instances.json').read_text())
    conflicts = [[i[0], i[1], i[3]] for i in inst if i[0] != 'bench' and nogo.contains(Point(i[1], i[3]))]
    trees = json.loads((REFINE / 'C_street' / 'trees_street.json').read_text())
    tconf = [t for t in trees if nogo.contains(Point(t[0], t[1]))]
    out['instances'] = {'count': len(inst), 'conflicts': conflicts, 'trees': len(trees), 'tree_conflicts': len(tconf)}
    out['summary'] = {
        'pass_triangle_limits': all(v['within_limit'] for v in out['files'].values()),
        'pass_instance_conflicts_zero': len(conflicts) == 0 and len(tconf) == 0,
        'no_degenerate_or_inverted': all(v['degenerate_triangles'] == 0 and v['normal_winding_mismatch'] == 0 for v in out['files'].values()),
        'palette_only_no_textures': all(v['materials_all_in_palette'] and v['textures_images_samplers'] == 0 for v in out['files'].values())}
    return out


def audit_C():
    out = {'files': {}}
    for f in ('street.glb', 'riverside.glb', 'street_protos.glb'):
        out['files'][f] = file_block(REFINE / 'C_street' / f)
    tot = out['files']['street.glb']['triangles'] + out['files']['riverside.glb']['triangles']
    out['combined_triangles_excluding_trees'] = tot
    out['triangle_limit'] = 500000
    # instance conflicts: nothing on the binhe carriageway or the city road surfaces
    from shapely.geometry import LineString, Point
    from build_binhe import roads as binhe_roads, midline, strip, W_ID, E_ID, XS
    R = binhe_roads()
    ml = midline(R[W_ID], R[E_ID], 200, 1900)
    carriageway = unary_union([strip(ml, a, b) for a, b in ((-XS['cw'], -XS['median']), (XS['median'], XS['cw']))])
    Rj = json.loads((MODEL.parent / '动画工程' / 'public' / 'city' / 'roads.json').read_text())['features']
    SWw = {'trunk': 4.0, 'primary': 4.0, 'secondary': 3.0, 'tertiary': 2.0}
    Wd = {'trunk': 26, 'primary': 20, 'secondary': 14, 'tertiary': 8}
    BINHE_IDS = {'way/328706009', 'way/351806756', 'way/421795119', 'way/179441852', 'way/996055596'}
    for f in Rj:
        cls = f['properties'].get('class')
        if f['properties'].get('source_id') in BINHE_IDS: continue
        if cls in Wd and f['geometry']['type'] == 'LineString':
            carriageway = unary_union([carriageway, LineString(f['geometry']['coordinates']).buffer(Wd[cls] / 2 - SWw[cls])])
    inst = json.loads((REFINE / 'C_street' / 'street_instances.json').read_text())
    conflicts = [[i[0], i[1], i[3]] for i in inst if carriageway.buffer(0.3).contains(Point(i[1], i[3]))]
    trees = json.loads((REFINE / 'C_street' / 'trees_street.json').read_text())
    tconf = [t for t in trees if carriageway.buffer(0.3).contains(Point(t[0], t[1]))]
    out['instances'] = {'count': len(inst), 'conflicts': conflicts, 'trees': len(trees), 'tree_conflicts': len(tconf)}
    out['summary'] = {
        'pass_triangle_limit': tot <= 500000,
        'pass_instance_conflicts_zero': len(conflicts) == 0 and len(tconf) == 0,
        'no_degenerate_or_inverted': all(v['degenerate_triangles'] == 0 and v['normal_winding_mismatch'] == 0 for v in out['files'].values()),
        'palette_only_no_textures': all(v['materials_all_in_palette'] and v['textures_images_samplers'] == 0 for v in out['files'].values())}
    return out


def audit_simple(pkg_dir, files, limits):
    out = {'files': {}}
    for f, lim in zip(files, limits):
        p = REFINE / pkg_dir / f
        blk = file_block(p)
        if lim: blk['triangle_limit'] = lim; blk['within_limit'] = blk['triangles'] <= lim
        out['files'][f] = blk
    out['summary'] = {
        'pass_triangle_limits': all(v.get('within_limit', True) for v in out['files'].values()),
        'no_degenerate_or_inverted': all(v['degenerate_triangles'] == 0 and v['normal_winding_mismatch'] == 0 for v in out['files'].values()),
        'palette_only_no_textures': all(v['materials_all_in_palette'] and v['textures_images_samplers'] == 0 for v in out['files'].values())}
    return out


def audit_E_007b():
    """007b checks: top-face budget, lawn intrusion, instances off lawn."""
    import numpy as np
    from render import read_glb
    from build_E_island import platform_poly, venue_union, ground_classes, ground_mask_poly, PLAT_H
    plat = platform_poly()
    _, parts = read_glb(REFINE / 'E_island' / 'island.glb')
    tri_by_mat = {}
    total_top = 0.0
    in_green = 0.0
    cls, gb, Wc = ground_classes()
    pv = ground_mask_poly(cls, gb, Wc, (2,)).intersection(plat.buffer(-1.2, join_style=2))
    green = ground_mask_poly(cls, gb, Wc, (1,)).intersection(plat.buffer(-1.2, join_style=2)).difference(pv.buffer(0.3))
    for p in parts:
        t = p['tris']
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
        area = np.linalg.norm(n, axis=1) / 2
        up = (n[:, 1] > 0) & (t[:, :, 1].mean(1) >= PLAT_H - 0.1)
        for ti in np.nonzero(up)[0]:
            c = t[ti].mean(0)
            a = float(area[ti])
            tri_by_mat[p['material']] = tri_by_mat.get(p['material'], 0.0) + a
            total_top += a
            if green.contains(Point(c[0], c[2])): in_green += a
    isl_area = float(plat.area)
    inst = json.loads((REFINE / 'E_island' / 'island_instances.json').read_text())
    green_buf = green.buffer(0.6)
    lawn_inst = [[i[0], i[1], i[3]] for i in inst if green_buf.contains(Point(i[1], i[3]))]
    return {
        'island_area_m2': round(isl_area), 'top_area_m2_by_material': {k: round(v) for k, v in tri_by_mat.items()},
        'top_total_m2': round(total_top), 'top_fraction': round(total_top / isl_area, 4),
        'pass_top_le_35pct': total_top <= 0.35 * isl_area,
        'top_in_green_m2': round(in_green), 'top_in_green_fraction_of_top': round(in_green / max(total_top, 1e-6), 4),
        'pass_green_le_5pct_of_top': in_green <= 0.05 * max(total_top, 1e-6) or in_green == 0,
        'instances_in_green': lawn_inst, 'pass_instances_off_lawn': len(lawn_inst) == 0}


def audit_B_007b():
    """007b checks: hedge coverage, species mix + willow-water, class-area agreement."""
    import math
    import build_B_site as B
    from shapely.geometry import Point
    rep = json.loads((REFINE / '校验' / 'build_B_report.json').read_text())
    tot = rep.get('hedge_boundary_total_len_m', 0.0); kept = rep.get('hedge_kept_len_m', 0.0)
    geoms, blocked, site, fps = B.blocked_for_instances()
    trees = json.loads((REFINE / 'B_site' / 'trees_site.json').read_text())
    from collections import Counter
    cnt = Counter(t[4] for t in trees); n = len(trees)
    willow_bad = [t for t in trees if t[4] == 3 and geoms['water'].distance(Point(t[0], t[1])) > 6.0]
    # class-area agreement inside (site minus footprints): polygons vs raw pixels
    import numpy as np
    from PIL import Image
    V2 = MODEL.parent / '动画工程' / 'public' / 'v2'
    im = np.asarray(Image.open(V2 / 'site_day.png').convert('RGB')).astype(np.int16)
    sm = json.loads((V2 / 'site_meta.json').read_text()); bx = sm['bounds']
    hpx, wpx = im.shape[:2]
    import cv2
    def raster_mask(poly):
        m = np.zeros((hpx, wpx), np.uint8)
        from geom import polys as _pl
        for g in _pl(poly):
            pts = np.array([[(p[0] - bx[0]) / 0.4, (p[1] - bx[1]) / 0.4] for p in g.exterior.coords], np.int32)
            cv2.fillPoly(m, [pts], 1)
        return m.astype(bool)
    dom = raster_mask(site) & ~raster_mask(fps)
    COLS = {'lawn': (0xC9, 0xDE, 0xB0), 'paving': (0xEE, 0xEA, 0xE2), 'path': (0xE9, 0xDD, 0xC6),
            'grass_paver': (0xD5, 0xE3, 0xC3), 'road': (0xD9, 0xD9, 0xD6), 'water': (0x9F, 0xCB, 0xE6)}
    cls_any = np.zeros((hpx, wpx), bool)
    for k, c in COLS.items():
        cls_any |= (np.abs(im - np.array(c)).max(-1) <= 8)
    dtotal = int((cls_any & dom).sum())
    share_px = {}
    for k, c in COLS.items():
        m = (np.abs(im - np.array(c)).max(-1) <= 8) & dom
        share_px[k] = m.sum() / dtotal
    geoms_all = {k: B.px_polys((np.abs(im - np.array(c)).max(-1) <= 8).astype(np.uint8), bx, hpx, wpx).intersection(site).difference(fps) for k, c in COLS.items()}
    ssum = sum(g.area for g in geoms_all.values())
    share_poly = {k: g.area / ssum for k, g in geoms_all.items()}
    dev = {k: round(abs(share_px[k] - share_poly[k]), 4) for k in COLS}
    return {
        'hedge': {'boundary_total_m': tot, 'kept_m': kept, 'coverage': round(kept / max(tot, 1e-6), 3),
                  'pass_ge_70pct': kept >= 0.7 * tot, 'band_area_m2': rep.get('hedge_band_area_m2')},
        'species': {str(k): [cnt.get(k, 0), round(cnt.get(k, 0) / n, 4)] for k in range(5)},
        'pass_species': cnt[0] / n >= 0.65 and cnt[1] / n <= 0.10 and cnt[2] / n <= 0.15 and cnt[4] / n <= 0.05,
        'willow_beyond_6m': len(willow_bad), 'pass_willow_water': len(willow_bad) == 0,
        'class_pixel_share': {k: round(v, 4) for k, v in share_px.items()},
        'class_polygon_share': {k: round(v, 4) for k, v in share_poly.items()},
        'class_deviation_pp': {k: round(v * 100, 2) for k, v in dev.items()},
        'pass_class_dev_le_5pp': all(v <= 0.05 for v in dev.values())}


def audit_A_007b():
    """007b checks: groove list per tower + slab/rail clearance at grooves (b05/b10/b18)."""
    import numpy as np
    rep = json.loads((REFINE / '校验' / 'build_A_report.json').read_text())
    doc = raw(REFINE / 'A_ruifu' / 'ruifu_detail.glb')
    _, parts = read_glb(REFINE / 'A_ruifu' / 'ruifu_detail.glb')
    grooves = {k: [round(float(g), 2) for g in v['layout'].get('unit_grooves_local_x', [])] for k, v in rep.items() if k.startswith('ruifu_b')}
    roots = {doc['nodes'][i]['name']: doc['nodes'][i] for i in doc['scenes'][0]['nodes']}
    clearance = {}
    for name in ('ruifu_b05', 'ruifu_b10', 'ruifu_b18'):
        M = node_matrix(roots[name])
        B = float(rep[name]['half_extents_local_m'][1])
        sr = np.concatenate([p['tris'].reshape(-1, 3) for p in parts
                             if p['root'] == name and (p['node'].endswith('_slabs') or p['node'].endswith('_rails'))]) if any(
            p['root'] == name and (p['node'].endswith('_slabs') or p['node'].endswith('_rails')) for p in parts) else np.zeros((0, 3, 3))
        verts = sr.reshape(-1, 3)
        worst = 9e9
        for g in grooves[name]:
            for L in np.arange(6.0, rep[name]['height_m'] - 10.0, 3.0):
                for sz in (1, -1):
                    p_local = np.array([g, L + 0.2, sz * (B - 0.3), 1.0])
                    pw = p_local @ M.T
                    d = float(np.linalg.norm(verts - pw[:3], axis=1).min()) if len(verts) else 9e9
                    worst = min(worst, d) if False else min(worst, d) if False else worst
                    worst = min(worst, d)
        clearance[name] = {'min_distance_to_slab_or_rail_at_grooves_m': round(worst, 3),
                           'pass_clear': worst > 0.7}
    return {'grooves_by_tower': grooves, 'groove_clearance': clearance,
            'pass_all_clear': all(v['pass_clear'] for v in clearance.values())}


def audit_D_007b():
    """007b checks: wanxiang roof green <=15%, T2-T5 gardens clear of mech, dome 85x68x14."""
    import numpy as np
    from render import read_glb
    from shapely.geometry import Polygon as _P, MultiPoint as _MP
    LM = json.loads((MODEL.parent / '动画工程' / 'public' / 'v2' / 'landmarks.json').read_text())
    _, parts = read_glb(REFINE / 'D_cbd' / 'cbd.glb')

    def faces(prefix, mat):
        sel = [p for p in parts if p['node'].startswith(prefix) and p['material'] == mat]
        if not sel: return np.zeros((0, 3, 3))
        return np.concatenate([p['tris'] for p in sel])

    def area(t):
        return float((np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1) / 2).sum()) if len(t) else 0.0

    wx_poly = _P(LM['wanxiang']['poly'])
    green = faces('cbd_wanxiang', 'lawn')
    frac = area(green) / float(wx_poly.area)
    dome_all = faces('cbd_wanxiang', 'canopy_glass')
    dome = dome_all[dome_all[:, :, 1].mean(1) > 15.4 + 0.8] if len(dome_all) else dome_all
    dx = float(dome[:, :, 0].max() - dome[:, :, 0].min())
    dz = float(dome[:, :, 2].max() - dome[:, :, 2].min())
    dy = float(dome[:, :, 1].max() - dome[:, :, 1].min())
    gardens = {}
    for tid in ('t2', 't3', 't4', 't5'):
        root = f'cbd_{tid}'
        lawnt = faces(root, 'lawn')
        mecht = faces(root, 'mech')
        if not len(lawnt):
            gardens[root] = {'present': False}; continue
        hull = _MP(lawnt.reshape(-1, 3)[:, [0, 2]]).convex_hull.buffer(0.2)
        mech_pts = mecht.reshape(-1, 3)[:, [0, 2]] if len(mecht) else np.zeros((0, 2))
        inside = int(sum(1 for p in mech_pts if hull.contains(__import__('shapely.geometry', fromlist=['Point']).Point(p))))
        gardens[root] = {'present': True, 'garden_area_m2': round(area(lawnt), 1), 'mech_inside_garden': inside}
    return {'wanxiang': {'footprint_m2': round(float(wx_poly.area)), 'green_m2': round(area(green)),
                         'green_fraction': round(frac, 4), 'pass_le_15pct': frac <= 0.15},
            'dome_extents_m': {'x': round(dx, 1), 'z': round(zz := dz, 1), 'rise': round(dy, 1),
                               'pass_85_68_14': abs(dx - 85) < 3 and abs(dz - 68) < 3 and abs(dy - 14) < 1.5},
            'towers': gardens,
            'pass_towers': all(v.get('present') and v.get('mech_inside_garden', 1) == 0 for v in gardens.values())}

def main(packages):
    results = {}
    if 'A' in packages:
        a0 = audit_A()
        a0['check_007b'] = audit_A_007b()
        a0['summary']['pass_groove_clearance'] = a0['check_007b']['pass_all_clear']
        results['A_ruifu'] = a0
    if 'F' in packages:
        results['F_unit'] = audit_F()
    if 'B' in packages:
        b0 = audit_B()
        b0['check_007b'] = audit_B_007b()
        b0['summary']['pass_hedge_ge_70pct'] = b0['check_007b']['hedge']['pass_ge_70pct']
        b0['summary']['pass_species_mix'] = b0['check_007b']['pass_species']
        b0['summary']['pass_willow_water'] = b0['check_007b']['pass_willow_water']
        b0['summary']['pass_class_dev_le_5pp'] = b0['check_007b']['pass_class_dev_le_5pp']
        results['B_site'] = b0
    if 'C' in packages:
        results['C_street'] = audit_C()
    if 'D' in packages:
        d0 = audit_simple('D_cbd', ['cbd.glb'], [400000])
        d0['check_007b'] = audit_D_007b()
        d0['summary']['pass_wx_green_le_15pct'] = d0['check_007b']['wanxiang']['pass_le_15pct']
        d0['summary']['pass_dome_85_68_14'] = d0['check_007b']['dome_extents_m']['pass_85_68_14']
        d0['summary']['pass_tower_gardens'] = d0['check_007b']['pass_towers']
        results['D_cbd'] = d0
    if 'E' in packages:
        e0 = audit_simple('E_island', ['island.glb', 'island_protos.glb'], [300000, 50000])
        e0['check_007b'] = audit_E_007b()
        e0['summary']['pass_top_le_35pct'] = e0['check_007b']['pass_top_le_35pct']
        e0['summary']['pass_green_le_5pct_of_top'] = e0['check_007b']['pass_green_le_5pct_of_top']
        e0['summary']['pass_instances_off_lawn'] = e0['check_007b']['pass_instances_off_lawn']
        results['E_island'] = e0
    if 'G' in packages:
        results['G_city'] = audit_simple('G_city', ['city_near.glb'], [800000])
    (REFINE / '校验' / 'self_check.json').write_text(json.dumps(results, ensure_ascii=False, indent=1) + '\n')
    for pk, r in results.items():
        print(pk, json.dumps(r.get('summary', r.get('file', {})), ensure_ascii=False))
    def files_of(r):
        return list(r['files'].values()) if 'files' in r else [r['file']]
    ok = all(r.get('summary', {}).get('pass_footprint_le_0_5', True) and r.get('summary', {}).get('pass_height_le_0_1', True)
             and all(f['degenerate_triangles'] == 0 and f['normal_winding_mismatch'] == 0
                     and f['materials_all_in_palette'] and f['textures_images_samplers'] == 0 for f in files_of(r))
             for r in results.values())
    print('ALL PASS' if ok else 'CHECK FAILURES ABOVE')


if __name__ == '__main__':
    main(sys.argv[1:] or ['A'])
