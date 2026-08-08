# 🎨 Hermes Dashboard 自定义主题资产

本目录存放本仓库 fork 自带的 **dashboard 用户主题**（官方机制：放入
`~/.hermes/dashboard-themes/<name>.yaml` 即被后端自动发现，无需改代码）。

## 目录

| 主题 | 风格 | 说明 |
|------|------|------|
| [win11-purple.yaml](./win11-purple.yaml) | Windows 11 Fluent · 柔和紫 · 护眼 | 深色 Mica 材质 + 紫罗兰强调色 + 17px 大字体 |

## 安装（以 win11-purple 为例）

```bash
# 1. 把主题 YAML 放到 Hermes 主题目录（官方发现路径）
mkdir -p ~/.hermes/dashboard-themes
cp dashboard-themes/win11-purple.yaml ~/.hermes/dashboard-themes/

# 2. 激活（官方配置命令，实时生效）
hermes config set dashboard.theme win11-purple
```

验证：`curl -s http://127.0.0.1:9119/api/dashboard/themes` 应能看到
`win11-purple` 且 `active` 字段为 `win11-purple`。

> 也可以在 dashboard 页面右上角调色板图标（主题切换器）里切换，选择会
> 持久化到 `config.yaml` 的 `dashboard.theme`。

## 主题字段参考

- `palette`：3 层色板 `background` / `midground`（文字+强调）/ `foreground`（高光）
  + `warmGlow`（光晕）+ `noiseOpacity`（颗粒）
- `typography`：`fontSans` / `fontMono` / `fontDisplay` / `fontUrl` /
  `baseSize`（根字号，rem 基准）/ `lineHeight` / `letterSpacing`
- `layout`：`radius`（圆角）/ `density`（compact / comfortable / spacious）
- `colorOverrides`：显式覆盖 shadcn 语义色（primary / accent / muted / border / ring …）
- `componentStyles`：按组件桶覆盖 CSS（card / header / sidebar / tab …）
- `customCSS`：任意选择器级 CSS（≤ 32 KiB），随主题注入/清理
- `layoutVariant`：standard / cockpit / tiled

完整文档见上游
[Extending the dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard)。
