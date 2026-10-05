# 更新日志 (Changelog)

## 2026-10-05

### 新增卡片管理
- 新增独立的卡片管理入口，提供“我的卡片库”和“当前任务”两个视图。
- 可将卡片保存为可复用配置；使用模板会创建新的任务卡片，不会自动提交任务。
- 支持多分组、自定义标签、搜索和筛选，并展示应用封面。
- 旧草稿会自动导入卡片库；管理分组和标签时保留当前任务状态、未保存参数、文件及下载目录。

### Card management
- Added a dedicated card manager with separate library and current-task views.
- Save reusable card configurations; using a template creates a fresh task card without submitting a job.
- Organize and find cards with multiple groups, custom tags, search, filters, and app covers.
- Existing drafts are imported into the library while task state, unsaved parameters, files, and download directories remain available during organization.

## 历史版本记录 (Previous release history)

以下保留此前 README 中的完整版本更新记录。

### English

## 📅 Changelog

### v1.6.6
- Automatically refresh relocated Tauri build caches in the macOS and Windows packaging shortcuts, fixing stale plugin permission paths after copying the project folder.
- Allow other cards to be submitted while multi-task scheduling is running; share live API queue capacity across accounts and deduplicate repeated keys.
- Add optional app access passwords and instance retention (10–180 seconds, Enterprise Shared keys); support both documented upload response formats.
- Fix H3 / ComfyUI v3 COMBO dropdowns and BOOLEAN descriptors in both single-task and batch forms.
- Remove Duck Decoder settings, automatic processing, and manual result decoding.

### v1.6.5
- RH site separation adaptation; added English UI language.

### v1.6.4
- **⚡ RunningHub Standard Model API**: Added enterprise shared API settings, automatic concurrency detection, standard model registry loading, parameter loading, price preview, and continuous submit support.
- **🧹 UI Cleanup**: Removed short drama startup mode, hid excellent UP recommendations, removed friend links, and tightened API slot layout.
- **📦 Packaging Shortcuts**: Added local shortcuts for macOS universal builds, Windows x64 builds, and a macOS damaged-app repair helper.

### v1.6.3
- **🔧 Bug Fixes**: Fixed known issues.

### v1.6.1
- **🔧 Bug Fixes**: Fixed some known issues.

### v1.5.9 beta 0404
- **🔧 Auto-save Fix**: Fixed auto-save functionality issues for improved reliability.
- **⚡ Multi-task Parallel Mode**: Added multi-task parallel execution mode (requires testing).
- **🗑️ Removed RH Contest Tab**: Removed the RH contest event tab.

### v1.5.6 beta 0127v2
- **🎨 UI Refactor**: Brand new interface design, providing a more modern visual experience.
- **🏪 Official App Store**: Added official app store, supporting **app search** to easily find tools.
- **🃏 App Cards**: Optimized app display with card view.
- **⚡ Batch Processing Enhancements**:
  - Support **custom task names**.
  - New **retry for failed batch tasks** and **individual retry** functions.
  - Added **batch completion reminders**.
- **🧰 Toolbox & Modules**: New toolbox and module architecture, with more utility tools to come.
- **🛠️ Other Optimizations**: Various detail improvements and performance upgrades.

### 中文

## 📅 更新日志 (Changelog)

### v1.6.6
- macOS / Windows 打包脚本自动清理搬迁目录后失效的 Tauri 缓存，修复旧目录权限文件路径导致的打包失败。
- 修复提交一张卡片后锁定其他卡片的问题，支持运行中继续提交；按各账号实时队列容量并发调度，重复 Key 不重复计算槽位。
- 适配应用访问密码、企业共享实例保留时长（10–180 秒），兼容中英文文档的两种上传响应格式。
- 修复 H3 / ComfyUI v3 的 COMBO 下拉列表和 BOOLEAN 参数描述解析，单次运行与批量设置共用兼容逻辑。
- 移除小黄鸭解码入口、自动解码和历史结果手动解码。

#### H3 参数问题核对
- 通过公开应用列表搜索 H3，再读取公开详情页参数，确认应用 [2101876745396908034](https://www.runninghub.cn/ai-detail/2101876745396908034) 的 `ref_image_size` 和 [2101871939232034818](https://www.runninghub.cn/ai-detail/2101871939232034818) 的 `aspect_ratio` 使用 `["COMBO", {"options": [...]}]` 格式；旧解析会显示 `COMBO` / `[object Object]`。
- 修复类型描述与真实选项的区分，保留音频上传组件和旧版下拉格式。真实公开参数样例保存在 `tests/fixtures/h3-inputs.json`，可运行 `node --test tests/runninghub.test.mjs` 验证。

#### 官方接口核对（2026-09-21）
- [更新日志](https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287335)：补充 `accessPassword` 和 `retainSeconds`。在卡片“应用运行选项”填写；访问密码仅保留在当前会话，不写入草稿。
- [API Key 队列状态](https://www.runninghub.cn/runninghub-api-doc-cn/api-432926239)：使用 `concurrentLimit`、`totalCurrentTasks` 调度，接口不可用（404/405/5xx）时回退到账户信息。
- [国内上传文档](https://rhtv.runninghub.cn/runninghub-api-doc-cn/api-425749007)与[英文上传文档](https://www.runninghub.cn/runninghub-api-doc-en/api-425761098)分别示例 `code: 0` / `fileName` 和 `code: 200` / `filename`，均已兼容。
- AI 应用继续使用 `/task/openapi/ai-app/run`，结果查询沿用 `/openapi/v2/query` 并兼容旧结果接口。标准模型列表继续从官方注册表动态加载。

### v1.6.5
- RH站点隔离适配，增加英文界面语言。

### v1.6.4
- **⚡ RunningHub 标准模型 API**: 新增企业共享 API 设置、自动获取并发数、模型注册表加载、参数加载、价格预估和运行中继续提交。
- **🧹 界面清理**: 移除短剧启动模式，隐藏优秀 UP 应用推荐，移除交流支持中的友情链接，并压缩 API 槽位布局。
- **📦 打包快捷方式**: 新增 macOS 双芯片通用构建、Windows x64 构建，以及 macOS “应用已损坏”修复工具。

### v1.6.3
- **🔧 问题修复**: 修复已知问题。

### v1.6.1
- **🔧 问题修复**: 修复一些已知问题。

### v1.5.9 beta 0404
- **🔧 修复自动保存**: 修复自动保存功能相关问题，提升稳定性。
- **⚡ 多任务并行模式**: 新增多任务并行执行模式（需测试）。
- **🗑️ 移除RH大赛活动标签**: 移除RH大赛活动入口标签。

### v1.5.6 beta 0127v2
- **🎨 UI 重构**: 界面全新改版，提供更现代化的视觉体验。
- **🏪 官方应用商城**: 新增官方应用商城，支持**搜索应用**，轻松获取所需工具。
- **🃏 应用卡片**: 优化应用展示形式，增加应用卡片显示。
- **⚡ 批量处理增强**:
  - 支持**自定义任务名称**。
  - 新增**批量失败重试**及**单独重试**功能。
  - 增加**批量完成提醒**。
- **🧰 工具箱与模块**: 新增工具箱及模块架构，后续将持续更新实用工具。
- **🛠️ 其他优化**: 包含若干细节优化与性能提升。
