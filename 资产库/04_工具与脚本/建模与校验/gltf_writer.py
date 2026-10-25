"""Deterministic glTF 2.0 writer for pilot_o1 (copied from 模型/源文件/gltf_writer.py and adapted).

Changes vs. the original:
- material palette = HR-VIDEO-TASK-007 section 4 (names and perceived colours);
- materials are created lazily, so each GLB only carries the slots it uses;
- colours are written as perceived values directly (same convention as the original
  writer and bridges/汇报.md: no sRGB->linear conversion); the hex is kept in extras.
Units metres, Y up, no textures, no cameras, no lights.
"""
from __future__ import annotations
import json, struct
from pathlib import Path
import numpy as np

PALETTE = {
    'wall': '#F3F1EC', 'glass': '#5E7488', 'rail_glass': '#4F677D', 'gold': '#D2B37A',
    'crown': '#D9BA82', 'office_glass': '#6F8FA8', 'office_frame': '#DCE2E6', 'stone': '#E9E2D6',
    'roof': '#EEEAE2', 'mech': '#C9C4BA', 'asphalt': '#A7AEB4', 'curb': '#E3E3DE',
    'sidewalk': '#E9E2D3', 'median_green': '#B9D29C', 'lamp': '#6F665C', 'light': '#FFE6B8',
    'rail': '#8F867A', 'path': '#E8DDC6', 'bench': '#B98D62', 'water_edge': '#D9D3C9',
    # HR-VIDEO-TASK-007 section 4 additions (architecture)
    'led': '#D6DCE0', 'copper': '#9A6A55', 'venue_white': '#F4F1EA', 'canopy_glass': '#BFD6E2',
    # section 4.2 additions (roads & landscape)
    'lawn': '#C9DEB0', 'paving': '#EEEAE2', 'grass_paver': '#D5E3C3', 'hedge': '#7FA868',
    'water': '#9FCBE6', 'deck': '#C9A27A', 'planter': '#D9D2C6',
    # section 4.3 unit interior (package F)
    'unit_wall': '#FBF9F4', 'floor_wood': '#E9DCC6', 'floor_stone': '#EEE8DE', 'wood': '#C8A27E',
    'wood_dark': '#94735A', 'oak': '#CDAA80', 'fabric_oat': '#E8DECF', 'linen': '#F4EEE4',
    'fabric_sage': '#B7C4A5', 'fabric_blue': '#A9BDC8', 'fabric_clay': '#D9A383', 'rug': '#E4D5BE',
    'white': '#FBF9F4', 'counter': '#D9D3C9', 'metal_gold': '#D8B77A', 'ink': '#3E3A36',
    'mirror': '#C9D8DE', 'window_glass': '#CFE3EA', 'leaf': '#7FA06A', 'pot': '#CDB79C',
}


def hex_rgb(h):
    h = h.lstrip('#'); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


class GLB:
    def __init__(self, scene_name, generator='HR-VIDEO-TASK-006 pilot_o1 deterministic Python'):
        self.doc = {'asset': {'version': '2.0', 'generator': generator},
                    'scene': 0, 'scenes': [{'name': scene_name, 'nodes': []}],
                    'nodes': [], 'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': []}
        self.binary = bytearray(); self.materials = {}; self.triangles = 0

    def material(self, name):
        if name not in PALETTE:
            raise KeyError(f'material {name!r} not in task-007 palette')
        if name not in self.materials:
            self.materials[name] = len(self.doc['materials'])
            self.doc['materials'].append({'name': name, 'pbrMetallicRoughness': {
                'baseColorFactor': hex_rgb(PALETTE[name]) + [1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.9},
                'extras': {'display_hex': PALETTE[name]}})
        return self.materials[name]

    def node(self, name, parent=None, translation=None, rotation=None, extras=None, mesh=None):
        node = {'name': name}
        if translation is not None: node['translation'] = [float(v) for v in translation]
        if rotation is not None: node['rotation'] = [float(v) for v in rotation]
        if mesh is not None: node['mesh'] = mesh
        if extras is not None: node['extras'] = extras
        idx = len(self.doc['nodes']); self.doc['nodes'].append(node)
        if parent is None: self.doc['scenes'][0]['nodes'].append(idx)
        else: self.doc['nodes'][parent].setdefault('children', []).append(idx)
        return idx

    def accessor(self, array, kind, target, component=5126):
        array = np.ascontiguousarray(array); offset = len(self.binary)
        while offset % 4: self.binary.extend(b'\0'); offset += 1
        payload = array.tobytes(); self.binary.extend(payload)
        view = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload), 'target': target})
        acc = {'bufferView': view, 'componentType': component, 'count': int(len(array)), 'type': kind}
        if kind == 'VEC3': acc.update(min=array.min(axis=0).astype(float).tolist(), max=array.max(axis=0).astype(float).tolist())
        idx = len(self.doc['accessors']); self.doc['accessors'].append(acc); return idx

    def mesh(self, name, parts):
        """parts: {slot: (positions, normals, faces)} or iterable of (xyz, nrm, ff, slot)."""
        if isinstance(parts, dict): items = [(v[0], v[1], v[2], k) for k, v in parts.items()]
        else: items = list(parts)
        grouped = {}
        for xyz, nrm, ff, slot in items:
            if len(ff): grouped.setdefault(slot, []).append((xyz, nrm, ff))
        primitives = []
        for slot in sorted(grouped):
            positions = []; normals = []; faces = []; offset = 0
            for xyz, nrm, ff in grouped[slot]:
                positions.append(xyz); normals.append(nrm); faces.append(np.asarray(ff) + offset); offset += len(xyz)
            xyz = np.vstack(positions).astype('<f4'); norm = np.vstack(normals).astype('<f4')
            ff = np.vstack(faces).astype('<u4'); self.triangles += len(ff)
            primitives.append({'attributes': {'POSITION': self.accessor(xyz, 'VEC3', 34962),
                                              'NORMAL': self.accessor(norm, 'VEC3', 34962)},
                               'indices': self.accessor(ff.ravel(), 'SCALAR', 34963, 5125),
                               'material': self.material(slot), 'mode': 4})
        if not primitives: return None
        idx = len(self.doc['meshes']); self.doc['meshes'].append({'name': name, 'primitives': primitives}); return idx

    def save(self, path):
        while len(self.binary) % 4: self.binary.extend(b'\0')
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        js = json.dumps(self.doc, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
        js += b' ' * ((-len(js)) % 4)
        size = 12 + 8 + len(js) + 8 + len(self.binary)
        Path(path).write_bytes(struct.pack('<III', 0x46546c67, 2, size) + struct.pack('<II', len(js), 0x4e4f534a) + js +
                               struct.pack('<II', len(self.binary), 0x004e4942) + self.binary)
