# 动画工程

全片的 Remotion 4 + react-three-fiber + three.js 源码，以及配音对齐、地图烘焙、插画线稿、动图等工具脚本。

## 运行

```bash
npm install
npx remotion studio src/index.ts      # 打开工作台，选 Film3（全片）
```

渲染、渲染开关（`refine`、`refineUnit`、`noCaps`）、声音合成、代码地图和常见坑，见 [项目沉淀/05 接手指南](../项目沉淀/05_接手指南.md)。

## 数据和模型从哪来

工程运行时从 `public/` 读取数据和模型。仓库不含 `public/`，原因是里面混有甲方衍生资产、用户配音和第三方素材。各部分的来源：

| `public/` 下的路径 | 来源 |
|---|---|
| `city/` 中的城市、道路、水系、公园、文化岛、地形数据，五大馆模型 | 仓库 [资产库/01、02](../资产库/README.md) |
| `v2/` 中的远景城市、烘焙地面、树、Landsat 影像、三桥、和园、`refine/` 中的长风商务区、近景城市、文化岛、滨河道路 | 仓库 [资产库/01、02](../资产库/README.md) |
| `city/ruifu*`、`site_boundary.json`、`v2/landmarks.json`、`v2/site_*`、`v2/pilot/`、`refine/` 中的瑞府、小区、户型，`models/`、`style/unit_plan.json` 等 | 甲方衍生，只在原工作机 |
| `vo4/`（逐镜头配音）、`music/` | 用户配音、Pixabay 配乐，只在原工作机 |
| `client/`、`v2/ge_*`、`v2/thumbs/` 等 | 甲方资料、谷歌地球截图，只在原工作机 |

在原工作机上，`public/` 是完整的，可以直接渲染全片。
