# RunningHub AI Client (RunningHub AI 客户端)

RunningHub AI Client 是一个基于 React 和 Vite 构建的现代化桌面端应用，专为 RunningHub AI 服务设计。它提供了一个直观的图形化界面，使用户能够轻松配置工作流、批量运行任务、实时监控进度以及自动管理生成的内容。

<img width="2571" height="1764" alt="rh11" src="https://github.com/user-attachments/assets/4d7b5fc0-e251-4c8e-b788-f0b0446ef283" />


## ✨ 核心功能

- **🚀 快速连接**: 通过 API Key 和 WebApp ID 快速连接到 RunningHub 服务，自动获取应用节点配置。
- **🎨 可视化参数编辑**: 提供直观的表单编辑器，支持图片上传、文本输入、数值调整、选项列表及开关等多种参数类型。
- **⚡ 批量任务处理**: 支持导入批量数据，实现多任务并发运行，大幅提升工作效率。
- **📊 实时状态监控**: 在运行视图中实时查看任务进度、成功/失败状态及详细的错误日志。
- **💾 自动保存系统**: 内置自动保存服务，可配置本地存储目录，自动下载并分类保存任务生成的图片、视频等文件。
- **📝 历史记录管理**: 自动记录所有任务的运行历史和输出结果，支持随时回溯和查看。
- **🌙 深色模式**: 默认启用深色主题界面，提供专业且舒适的视觉体验。


## 🚀 快速开始

### 环境要求
- [Node.js](https://nodejs.org/) (推荐 v18 或更高版本)
- npm 或 yarn 包管理器

### 安装步骤

1. **安装依赖**
   在项目根目录下打开终端，运行：
   ```bash
   npm install
   ```

2. **启动开发环境**
   ```bash
   npm run dev
   ```
   或者在 Windows 环境下，直接双击运行根目录下的 `启动.bat` 脚本。

3. **构建生产版本**
   ```bash
   npm run build
   ```

## 📖 使用说明

1. **配置连接**: 
   启动应用后，在左侧面板输入您的 RunningHub `API Key` 和 `WebApp ID`，点击"下一步"以加载应用配置。

2. **调整参数**: 
   在中间的编辑器面板中，您可以查看到当前应用的所有可配置节点。根据需求修改各个节点的参数值（如上传参考图、修改提示词等）。

3. **执行任务**:
   - **单次运行**: 配置完成后，直接点击底部的"运行"按钮。
   - **批量运行**: 点击"批量运行"按钮，设置多组参数进行并发处理。

4. **获取结果与保存**: 
   任务完成后，结果将展示在右侧面板。
   - 您可以在左侧配置面板底部开启**自动保存**功能，并指定保存目录。开启后，生成的文件将自动下载到该目录。

## 🔗 相关链接与致谢

- **RunningHub 官网**: [https://www.runninghub.cn](https://www.runninghub.cn)
- **注册福利**: [点击注册送1000RH币](https://www.runninghub.cn/?inviteCode=rh-v1123)
- **项目制作**: [哔站 HooTooH](https://space.bilibili.com/527601196?spm_id_from=333.40164.0.0)
- **交流群**: QQ 543917943
- **感谢企鹅API测试支持**: [Penguin](https://github.com/PenguinTeo)
- 
---
© 2025 RunningHub Client. All Rights Reserved.
