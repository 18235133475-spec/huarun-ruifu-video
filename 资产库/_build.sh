#!/bin/bash
# 重建资产库：把散在工作目录里的可复用资产按类别硬链接到这里（不占额外磁盘，工作目录原路径不动）。
# 资产在原位置更新后重跑一次即可。用法：bash 资产库/_build.sh
set -e
cd "$(dirname "$0")"
V=../视频
PUB=$V/动画工程/public
link() { # link <目标目录> <源文件...>
  local dst=$1; shift; mkdir -p "$dst"
  for f in "$@"; do [ -e "$f" ] || { echo "缺少：$f" >&2; continue; }; ln -f "$f" "$dst/"; done
}

# 01 城市底座：开放数据加工而来，可复用（注意署名）
B=01_城市底座_太原长风
link $B/场景数据 $PUB/city/{buildings,roads,water,parks,island,terrain}.json $PUB/city/terrain_512.f32
link $B/远景城市 $PUB/v2/far_{buildings.json,city_nor.bin,city_pos.bin,day.png,night.png,meta.json}
link $B/烘焙地面 $PUB/v2/ground_{day,night,old}.png $PUB/v2/trees.json
link $B/历史影像_Landsat $PUB/v2/sat_2002.jpg $PUB/v2/sat_2002_style.jpg $PUB/v2/sat_2025.jpg $PUB/v2/sat_2025_style.jpg
link $B/原始数据/地形 $V/模型/terrain/{height.png,valid_mask.png,terrain_meta.json,readme.md}
link $B/原始数据/OSM $V/素材/01_地理数据/*
link $B/原始数据/高程瓦片 $V/素材/10_高程数据/tiles.json $V/素材/10_高程数据/preview_z12.png
link $B/原始数据/建筑GeoJSON $V/模型/city/buildings.json

# 02 地标与场景模型：按公开资料和开放数据自建，可复用
M=02_地标与场景模型
link $M/五大馆 $PUB/city/venue_*.glb $PUB/city/venue_meta.json $V/模型/venues/说明.md
link $M/汾河三桥 $PUB/v2/bridges/*.glb
link $M/和园 $PUB/v2/heyuan/*
R=$PUB/v2/refine
link $M/长风商务区 $R/cbd.glb
link $M/近景城市 $R/city_near.glb $R/city_near_ids.json
link $M/文化岛平台 $R/island.glb $R/island_protos.glb $R/island_instances.json $R/trees_island.json
link $M/滨河道路与绿带 $R/street.glb $R/riverside.glb $R/street_protos.glb $R/street_instances.json $R/trees_street.json

# 03 瑞府项目模型：由甲方图纸派生，只在本机复用，不外传（GitHub 仓库不收）
C=03_瑞府项目模型_甲方衍生_不外传
link $C/楼栋 $PUB/city/ruifu.glb $PUB/city/ruifu_meta.json $PUB/city/site_boundary.json $PUB/style/ruifu_footprints.json $R/ruifu_detail.glb $PUB/v2/landmarks.json
link $C/小区园林 $R/site.glb $R/site_protos.glb $R/site_instances.json $R/trees_site.json $PUB/v2/site_{day.png,night.png,meta.json,trees.json,shrubs.json}
link $C/户型 $PUB/models/unit_b02.glb $PUB/models/unit_b02_points.json $PUB/style/unit_plan.json $R/unit_b02_detail.glb $R/unit_furnish.glb

# 04 工具与脚本：引用原位置的脚本，复制一份方便查阅（脚本内的相对路径以原位置为准）
T=04_工具与脚本
link $T/配音对齐 $V/动画工程/tools/{asr_words.py,align_human.py,vo_timing.py,build_timeline.py,make_audio.py}
link $T/图文衍生 $V/动画工程/tools/{mkgif.py,insert_gifs.py}
link $T/地图烘焙 $V/动画工程/tools/v2/*.py
link $T/插画线稿 $V/动画工程/tools/style/*.py
link $T/建模与校验 $V/模型/refine_v1/源文件/{geom.py,gltf_writer.py,validate.cjs,audit_v1.py,render.py,cams.py}
echo "资产库已重建：$(find . -type f -not -name '_build.sh' | wc -l | tr -d ' ') 个文件"
