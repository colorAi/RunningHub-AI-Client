import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'zh' | 'en';

const LANGUAGE_STORAGE_KEY = 'rh_language';

const EN_TRANSLATIONS: Record<string, string> = {
  'RH客户端( H 版 ) v1.6.5': 'RH Client (H Edition) v1.6.5',
  '首页': 'Home',
  '设置': 'Settings',
  '个人中心': 'Account',
  '标准模型 API': 'Model API',
  '多任务模式': 'Multi-task',
  '其他工具': 'Other Tools',
  '工作区': 'Workspace',
  '我的收藏': 'My Favorites',
  '免责声明': 'Disclaimer',
  '正在加载界面...': 'Loading interface...',
  '免责声明与使用须知': 'Disclaimer and Terms of Use',
  '请仔细阅读以下条款': 'Please read the following terms carefully',
  '我已阅读并完全同意上述所有条款': 'I have read and agree to all terms above',
  '请先勾选同意条款': 'Please agree to the terms first',
  '同意并继续': 'Agree and Continue',
  '关闭': 'Close',
  '官方应用商城': 'Official App Store',
  '交流与支持': 'Community & Support',
  '综合推荐': 'Recommended',
  '最新发布': 'Newest',
  '最多好评': 'Top Rated',
  '搜索应用...': 'Search apps...',
  '手动刷新': 'Refresh',
  '加载中...': 'Loading...',
  '加载更多': 'Load More',
  '暂无推荐': 'No recommendations yet',
  '立即使用': 'Use Now',
  '使用次数': 'Uses',
  '喜欢': 'Likes',
  '赞助项目发展': 'Support This Project',
  '您的支持是持续维护的动力': 'Your support keeps this project moving forward',
  'RH客户端 的开发与维护需要大量的精力，如果您觉得本工具对您有所帮助，欢迎赞助作者喝杯咖啡。支持是持续维护的动力。': 'Developing and maintaining RH Client takes substantial time and effort. If this tool helps you, you are welcome to support its continued development.',
  '幻影AI 项目中心': 'Phantom AI Project Hub',
  '关注开源生态及项目动态，探索 AI 精彩世界。': 'Follow open-source projects and explore the world of AI.',
  '立即前往': 'Visit Now',
  'GitHub 仓库': 'GitHub Repository',
  '欢迎提交 PR 或 Issue，贡献代码与建议。': 'Pull requests, issues, code, and suggestions are welcome.',
  '哔哩哔哩': 'Bilibili',
  '@HooTooH 开发日记': '@HooTooH Development Log',
  '1000 RH 币礼包': '1,000 RH Coin Gift',
  '邀请码': 'Invite code',
  '立即体验': 'Get Started',
  '日常交流答疑': 'Community Help',
  '欢迎加入微信/QQ交流': 'Join our WeChat / QQ community',
  'API 设置': 'API Settings',
  '消费级 API 用于 AI 应用和多任务；企业共享 API 用于标准模型 API。并发数会从 RunningHub 自动获取。': 'Consumer APIs are used for AI Apps and multi-task scheduling; Enterprise Shared APIs are used for Model APIs. Concurrency is retrieved automatically from RunningHub.',
  '新增消费 API': 'Add Consumer API',
  'RunningHub 站点': 'RunningHub Region',
  '自动识别': 'Auto Detect',
  '国内站': 'China',
  '海外站': 'Global',
  '会通过只读队列接口判断 API Key 所属站点；粘贴 .cn / .ai 应用链接时也会自动识别。': 'Uses a read-only queue request to detect the API Key region. Pasted .cn / .ai app links are detected automatically.',
  'AI 应用槽位': 'AI App Slots',
  '标准模型槽位': 'Model API Slots',
  '企业共享 API': 'Enterprise Shared API',
  '用于标准模型 API 模块': 'Used by the Model API module',
  '用于 AI 应用、多任务调度': 'Used for AI Apps and multi-task scheduling',
  '获取信息': 'Fetch Info',
  '删除': 'Delete',
  '填写企业共享 API KEY': 'Enter Enterprise Shared API Key',
  '填写消费级 API KEY': 'Enter Consumer API Key',
  '并发数由 RunningHub 队列接口自动获取。': 'Concurrency is retrieved automatically from the RunningHub queue API.',
  '账户概览': 'Account Overview',
  '未填写 API Key': 'API Key not entered',
  '并发': 'Concurrency',
  'RH 币': 'RH Coins',
  '钱包余额': 'Wallet Balance',
  'API 类型': 'API Type',
  '运行 / 排队': 'Running / Queued',
  '这条 API 还未填写。': 'This API Key has not been entered.',
  '点击“获取信息”拉取余额和并发上限。': 'Click Fetch Info to load the balance and concurrency limit.',
  '本地保存 API Key': 'Save API Keys Locally',
  '关闭后清空本地已保存 API': 'Turning this off clears locally saved API Keys',
  '保存并关闭': 'Save and Close',
  '消费级': 'Consumer',
  '消费级 API': 'Consumer API',
  '企业': 'Enterprise',
  '共享': 'Shared',
  '企业共享': 'Enterprise Shared',
  '标准': 'Standard',
  '未配置': 'Not Configured',
  '去填写': 'Configure',
  '获取模型': 'Load Models',
  '获取中...': 'Loading...',
  '搜索模型': 'Search Models',
  '模型名称或 endpoint': 'Model name or endpoint',
  '类型': 'Type',
  '全部': 'All',
  '图像': 'Image',
  '视频': 'Video',
  '音频': 'Audio',
  '文本': 'Text',
  '文件': 'File',
  '分类': 'Category',
  '全部分类': 'All Categories',
  '具体模型': 'Model',
  '请选择模型': 'Select a model',
  '先获取模型': 'Load models first',
  '未分类': 'Uncategorized',
  '获取参数': 'Load Parameters',
  '请先在个人中心填写企业共享 API Key': 'Enter an Enterprise Shared API Key in Account first',
  '请先获取模型并选择具体模型': 'Load and select a model first',
  '获取模型列表失败': 'Failed to load the model list',
  '获取参数失败': 'Failed to load parameters',
  '参数设置': 'Parameters',
  '标准模型参数': 'Model Parameters',
  '无可用参数': 'No parameters available',
  '请在左侧获取模型并加载参数。': 'Load a model and its parameters from the left panel.',
  '请在左侧侧边栏输入您的 API Key 和应用 ID 以加载参数。': 'Enter your API Key and App ID in the left sidebar to load parameters.',
  '应用详情': 'App Details',
  '批量设置': 'Batch Settings',
  '运行': 'Run',
  '批量运行': 'Batch Run',
  '取消运行': 'Cancel Run',
  '取消批量': 'Cancel Batch',
  '继续提交': 'Submit More',
  '请输入参数值': 'Enter a value',
  '请输入文本...': 'Enter text...',
  '请输入开关值 (true/false 或其他)': 'Enter a switch value (true/false or other)',
  '点击或拖拽上传': 'Click or drag to upload',
  '点击上传或拖拽图片': 'Click or drag an image here',
  '点击或拖拽替换图片': 'Click or drag to replace the image',
  '点击替换': 'Click to replace',
  '已上传图像': 'Image uploaded',
  '已上传文件': 'File uploaded',
  '更换': 'Replace',
  '清除': 'Clear',
  '清除图片': 'Remove Image',
  '查看大图': 'View Full Size',
  '关闭预览': 'Close Preview',
  '音频预览': 'Audio Preview',
  '点击预览视频': 'Click to preview video',
  '视频已就绪，当前无法生成缩略图': 'Video is ready; a thumbnail is unavailable',
  '音频已就绪，当前无法直接试听': 'Audio is ready; inline playback is unavailable',
  '默认文件': 'Default file',
  '默认图像已加载': 'Default image loaded',
  '支持 JPG, PNG, WEBP': 'Supports JPG, PNG, WEBP',
  '等待连接': 'Waiting for connection',
  '等待文件上传中...': 'Waiting for uploads...',
  '本次免费': 'Free this time',
  '格式': 'Format',
  '支持': 'Supported',
  'PLUS 模式': 'PLUS Mode',
  'PLUS 模式已关闭（24G）': 'PLUS Mode Off (24G)',
  'PLUS 模式已开启（48G）': 'PLUS Mode On (48G)',
  '准备中': 'Preparing',
  '提交中': 'Submitting',
  '排队中': 'Queued',
  '运行中': 'Running',
  '已完成': 'Completed',
  '失败': 'Failed',
  '正在准备任务环境...': 'Preparing task environment...',
  '正在提交任务到 RunningHub...': 'Submitting task to RunningHub...',
  '任务已提交，等待资源分配。': 'Task submitted; waiting for resources.',
  '任务正在执行，结果会自动刷新。': 'Task is running; results will refresh automatically.',
  '任务已执行完成。': 'Task completed.',
  '任务执行中': 'Task Running',
  '任务执行失败': 'Task Failed',
  '执行完成': 'Completed',
  '执行失败': 'Execution Failed',
  '实时进度': 'Live Progress',
  '当前任务进度': 'Current Task Progress',
  '节点进度': 'Node Progress',
  '批量进度': 'Batch Progress',
  '等待节点执行...': 'Waiting for node execution...',
  '查看结果': 'View Results',
  '返回编辑': 'Back to Editor',
  '运行日志': 'Run Log',
  '错误详情': 'Error Details',
  '请查看下方日志和错误详情。': 'Review the logs and error details below.',
  '任务已停止追踪': 'Task tracking stopped',
  '任务已在客户端停止跟踪，服务端已提交的任务可能仍在继续执行。': 'Tracking stopped in the client. Tasks already submitted may still be running on the server.',
  '准备就绪': 'Ready',
  '历史记录': 'History',
  '清空历史': 'Clear History',
  '配置中间的参数并点击"运行任务"，生成历史将显示在这里。': 'Configure parameters and run a task. Generated results will appear here.',
  '放大预览': 'Enlarge Preview',
  '在浏览器中打开': 'Open in Browser',
  '下载': 'Download',
  '下载文件': 'Download File',
  '已解码': 'Decoded',
  '解码': 'Decode',
  '多任务调度': 'Multi-task Scheduler',
  '每张卡片都是一个完整任务工作区，统一按 API 并发能力调度执行。当前并发槽位': 'Each card is a complete task workspace scheduled according to available API concurrency. Current slots',
  '新建卡片': 'New Card',
  '全部运行': 'Run All',
  '保存草稿': 'Save Draft',
  '保存多任务草稿': 'Save Multi-task Draft',
  '草稿名称': 'Draft Name',
  '请输入草稿名称': 'Enter a draft name',
  '请输入草稿名称，例如：批量头像生成': 'Enter a draft name, e.g. Batch Avatar Generation',
  '给当前卡片组合起个名字，方便后续快速恢复。': 'Name this card group so it can be restored quickly later.',
  '覆盖保存': 'Overwrite',
  '取消': 'Cancel',
  '保存': 'Save',
  '确认删除草稿': 'Delete Draft?',
  '删除草稿': 'Delete Draft',
  '暂无草稿': 'No drafts yet',
  '快速创建卡片': 'Quick Create',
  '创建空白卡片': 'Create Blank Card',
  '空白卡片': 'Blank Card',
  '最近使用': 'Recent',
  '收藏应用': 'Favorite Apps',
  '暂无收藏': 'No favorites yet',
  '还没有任务卡片': 'No task cards yet',
  '先创建一个卡片，多任务调度会根据 API 并发能力自动并行。': 'Create a card first. Tasks will run in parallel according to API concurrency.',
  '新任务卡片': 'New Task Card',
  '复制卡片': 'Duplicate Card',
  '删除卡片': 'Delete Card',
  '请输入 WebApp ID，或粘贴应用详情页链接': 'Enter a WebApp ID or paste an app detail URL',
  '加载': 'Load',
  '等待运行': 'Waiting',
  '待运行': 'Ready to Run',
  '已停止': 'Stopped',
  '停止': 'Stop',
  '当前卡片暂时锁定': 'This card is temporarily locked',
  '卡片进度': 'Card Progress',
  '最新结果': 'Latest Result',
  '暂无可预览结果': 'No preview available',
  '结果预览': 'Result Preview',
  '预览大图': 'Preview Full Size',
  '新标签页查看结果': 'Open result in a new tab',
  '下载当前结果': 'Download current result',
  '暂无日志': 'No logs yet',
  '用时': 'Duration',
  '第三方': 'Third Party',
  '币': 'Coins',
  '个参数': 'parameters',
  '个节点': 'nodes',
  '个结果': 'results',
  '个任务': 'tasks',
  '张卡片': 'cards',
  '调度进行中，当前卡片暂时锁定': 'Scheduling is active; this card is temporarily locked',
  '综合设置': 'General Settings',
  '工具箱': 'Toolbox',
  '管理自动保存、启动页和首页默认标签，让软件打开后直接进入标准模型 API、多任务或首页。': 'Manage auto-save, startup page, and the default Home tab.',
  '启动页:': 'Startup Page:',
  '首页默认标签:': 'Default Home Tab:',
  '自动保存已开': 'Auto-save On',
  '全局检测中': 'Global Detection On',
  '已启用': 'Enabled',
  '更多工具开发中...': 'More tools are coming...',
  '启动页设置': 'Startup Page',
  '选择启动软件后默认打开的页面。': 'Choose the page shown when the app starts.',
  '启动后先看应用推荐和收藏入口': 'Open recommendations and favorites on startup',
  '启动后直接进入标准模型 API 工作区': 'Open the Model API workspace on startup',
  '启动后直接进入 AI 应用多任务调度': 'Open AI App multi-task scheduling on startup',
  '首页设置': 'Home Settings',
  '选择启动进入首页时默认展示的标签页，后续也可以随时回来修改。': 'Choose the default tab shown when Home opens.',
  '进入首页后默认展示官方商城': 'Show the Official App Store by default',
  '默认启动后先展示交流与支持页面': 'Show Community & Support by default',
  '启动时刷新商城': 'Refresh Store on Startup',
  '开启后获取最新商城列表，关闭后使用缓存提升速度。': 'Load the latest store list on startup; turn off to use the faster cache.',
  '自动保存': 'Auto-save',
  '任务完成后，自动将结果保存到指定目录。': 'Automatically save results to the selected folder after completion.',
  '选择目录': 'Choose Folder',
  '重新选择目录': 'Choose Again',
  '清除目录': 'Clear Folder',
  '还没有选择保存目录': 'No save folder selected',
  '完成': 'Done',
  '小黄鸭解码': 'Duck Decoder',
  '自动识别并检测小黄鸭加密图，没有则跳过，有则直接解码，全局生效。': 'Detect Duck-encrypted images automatically and decode them when found.',
  '批量完成提醒': 'Batch Completion Alert',
  '批量任务全部完成后，播放指定的提示音进行通知。': 'Play a selected sound when all batch tasks finish.',
  '批量任务完成后播放提示音': 'Play a sound when batch tasks finish',
  '开启完成播报': 'Enable Completion Sound',
  '选择提示音': 'Choose Sound',
  '试听当前音效': 'Preview Sound',
  '播放中...': 'Playing...',
  '解码设置': 'Decoder Settings',
  '自动解码': 'Auto Decode',
  '始终打开': 'Always On',
  '解码密码': 'Decode Password',
  '如需密码请填入，不需要则留空': 'Enter a password if required; otherwise leave blank',
  '开启后直接显示解码结果': 'Show decoded results automatically',
  '开启后，该设置会对所有应用结果生效': 'Applies to results from every app',
  '开启后，所有应用结果都会先经过一遍小黄鸭智能解码检测，没有就跳过，有就自动解码。': 'All app results will be checked for Duck encryption and decoded automatically when detected.',
  '全局开启解码': 'Enable Globally',
  '项目地址': 'Project Link',
  '收藏': 'Favorite',
  '标签': 'Tags',
  '应用介绍': 'About This App',
  '使用': 'Use',
  '导入': 'Import',
  '导出': 'Export',
  '更新信息': 'Sync',
  '更新中': 'Syncing',
  '清理失效': 'Remove Invalid',
  '清理失效收藏': 'Remove Invalid Favorites',
  '已失效': 'Invalid',
  '取消收藏': 'Remove Favorite',
  '删除失效收藏': 'Delete Invalid Favorite',
  '在首页点击卡片右上角的星星即可收藏': 'Click the star on an app card to add it to favorites',
  '导出收藏': 'Export Favorites',
  '导入收藏': 'Import Favorites',
  '导出成功': 'Exported successfully',
  '导出失败': 'Export failed',
  '导入失败，请检查文件格式': 'Import failed. Check the file format.',
  '收藏同步完成': 'Favorites synchronized',
  '未发现新的收藏项': 'No new favorites found',
  '开': 'On',
  '关': 'Off',
  '开启': 'On',
  '禁用': 'Disabled',
  '是': 'Yes',
  '否': 'No',
  '请求失败，请稍后重试。': 'Request failed. Please try again later.',
  'API Key 校验失败，请检查 Key 是否正确。': 'API Key validation failed. Check that the Key is correct.',
  '当前接口没有访问权限，请检查账号或实例配置。': 'This API is not available to the current account or instance.',
  'Plus 实例未找到，请稍后重试或切回标准模式。': 'PLUS instance not found. Try again later or switch to Standard mode.',
  '节点参数与应用定义不匹配，请重新加载应用参数后再试。': 'Node parameters do not match the app definition. Reload the app parameters and try again.',
  '任务正在运行中，请稍候查询结果。': 'The task is running. Check again shortly.',
  '任务正在排队中，请稍候查询结果。': 'The task is queued. Check again shortly.',
  '任务执行失败，请查看节点错误详情。': 'Task failed. Review the node error details.',
  '请求过快，已触发限流，请稍后重试。': 'Rate limit reached. Please try again later.',
  '上传文件过大，请压缩后重试。': 'The uploaded file is too large. Compress it and try again.',
  '内容审核未通过，请调整输入内容后再试。': 'Content moderation failed. Adjust the input and try again.',
  '网络错误': 'Network Error',
  '未知错误': 'Unknown Error',
  '上传失败': 'Upload Failed',
  '提交失败': 'Submission Failed',
  '加载失败': 'Load Failed',
  '请先配置 API Key': 'Configure an API Key first',
  '没有可用的 API Key': 'No API Key available',
  '... (默认)': '... (Default)',
  '“开源精神薪火相传，每一份支持都是前进的力量。”': '“Open source thrives through every contribution.”',
  '"开源精神薪火相传，每一份支持都是前进的力量。"': '"Open source thrives through every contribution."',
  '删除后将无法恢复，确定要继续吗？': 'This cannot be undone. Do you want to continue?',
  '“始终打开”开启时，会对所有应用结果强制执行一次智能检测；上面的“自动解码”设置会作为全局默认行为生效。': 'Always On checks every app result. Auto Decode above remains the global default behavior.',
  '（已合并到现有任务）': '(Merged into the existing task)',
  '% · 已完成': '% · Complete',
  '🖱️ 滚轮缩放 | 中键/Shift+左键 拖拽画布 | 拖拽节点移动': '🖱️ Wheel: Zoom | Middle/Shift+Left: Pan | Drag: Move Node',
  '按 Esc 或点击遮罩关闭': 'Press Esc or click outside to close',
  '按选择顺序批量导入图片': 'Import images in selection order',
  '部分任务失败': 'Some Tasks Failed',
  '参数校验失败': 'Parameter Validation Failed',
  '从文件夹批量导入视频': 'Import Videos from Folder',
  '从文件夹批量导入图片': 'Import Images from Folder',
  '从文件夹批量导入音频': 'Import Audio from Folder',
  '从TXT文件导入提示词，每行为一个任务': 'Import prompts from TXT, one task per line',
  '当前 API 并发已被其他任务占用，等待空闲槽位后自动继续...': 'API concurrency is in use. Waiting for a free slot...',
  '当前 API 并发已被网页或其他任务占用，系统会在有空位时自动继续...': 'API concurrency is in use elsewhere. The task will continue automatically when a slot is free...',
  '当前 API 并发已被网页或其他任务占用，系统会在有空位时自动继续。': 'API concurrency is in use elsewhere. The task will continue automatically when a slot is free.',
  '当前 API 并发暂时已满，已回到队列等待自动重试': 'API concurrency is full. Returned to the queue for an automatic retry.',
  '当前环境不支持文件系统访问 API，暂时无法使用自动保存功能。': 'This environment does not support folder access, so auto-save is unavailable.',
  '当前仅支持小黄鸭解码，': 'Duck decoding is currently supported. ',
  '当前卡片没有可执行的任务单元。': 'This card has no runnable task units.',
  '当前没有可保存的卡片草稿。': 'There are no cards to save as a draft.',
  '当前没有可清理的失效收藏': 'There are no invalid favorites to remove.',
  '当前没有可用的 API Key，无法启动多任务调度。': 'No API Key is available. Multi-task scheduling cannot start.',
  '当前已有调度在运行，请等待结束后再启动新的卡片任务。': 'A schedule is already running. Wait for it to finish before starting another card.',
  '当前有任务正在调度，请等待结束后再加载草稿。': 'A schedule is running. Wait for it to finish before loading a draft.',
  '导入文档': 'Import Document',
  '等待 API 空闲槽位后自动继续': 'Waiting for a free API slot',
  '等待调度': 'Waiting for Scheduler',
  '等待批量调度': 'Waiting for Batch Scheduler',
  '第三方 API 余额不足': 'Insufficient third-party API balance',
  '第三方 API Key 无效': 'Invalid third-party API Key',
  '点击输入应用 ID': 'Click to enter an App ID',
  '点击下方“添加配置”按钮，复制当前参数开始设置': 'Click Add Configuration to copy the current parameters.',
  '调度进行中，按并发槽位': 'Scheduling according to concurrency slots',
  '多选': 'Multiple',
  '放大': 'Zoom In',
  '缩小': 'Zoom Out',
  '重置视图': 'Reset View',
  '该应用可能已被删除或无权访问': 'This app may have been deleted or is not accessible.',
  '获取 API 信息失败': 'Failed to load API information',
  '获取企业共享 API 信息失败': 'Failed to load Enterprise Shared API information',
  '加载应用失败': 'Failed to load the app',
  '节点参数校验失败': 'Node parameter validation failed',
  '节点执行失败': 'Node execution failed',
  '进入排队': 'Queued',
  '开始执行': 'Started',
  '没有可运行的卡片，请先加载应用并确认参数。': 'No runnable cards. Load an app and confirm its parameters first.',
  '目标节点': 'Target Node',
  '批量传视频': 'Batch Videos',
  '批量传音频': 'Batch Audio',
  '批量运行设置': 'Batch Run Settings',
  '批量任务必须开启自动解码，以便直接保存解码后的结果。': 'Auto Decode must be enabled for batch tasks so decoded results can be saved.',
  '批量任务完成': 'Batch Tasks Complete',
  '启用': 'Enabled',
  '切换 Plus 模式': 'Toggle PLUS Mode',
  '清空': 'Clear',
  '清空所有配置': 'Clear All Configurations',
  '请先配置 API Key 并填写 WebApp ID': 'Configure an API Key and enter a WebApp ID first',
  '请先选择保存目录，然后再启用自动保存': 'Choose a save folder before enabling auto-save',
  '请先在个人中心配置有效的 API Key': 'Configure a valid API Key in Account first',
  '请选择': 'Select',
  '取消提示': 'Cancel Notice',
  '全部任务完成': 'All Tasks Complete',
  '确定': 'Confirm',
  '热门应用': 'Popular Apps',
  '任务': 'Task',
  '任务名': 'Task Name',
  '任务排队中': 'Task Queued',
  '任务排队中...': 'Task Queued...',
  '任务失败': 'Task Failed',
  '任务完成': 'Task Complete',
  '任务运行中': 'Task Running',
  '任务运行中...': 'Task Running...',
  '任务执行结束，存在失败项': 'Tasks finished with failures',
  '仍有文件上传中，已跳过本次调度': 'Files are still uploading. This schedule was skipped.',
  '删除此配置': 'Delete Configuration',
  '上传': 'Upload',
  '设置文件名后缀，例如：ABC_Task_001.png': 'Set a filename suffix, e.g. ABC_Task_001.png',
  '输入 URL 或上传文件': 'Enter a URL or upload a file',
  '输入文本...': 'Enter text...',
  '输入应用 ID 或 .cn / .ai 应用链接': 'Enter an App ID or a .cn / .ai app link',
  '所选文件': 'Selected File',
  '添加多组参数配置，系统将按顺序依次执行任务。': 'Add parameter sets and they will run sequentially.',
  '添加配置': 'Add Configuration',
  '停止追踪': 'Stop Tracking',
  '图片': 'Image',
  '未选择图片文件': 'No image selected',
  '未找到视频加载节点（LoadVideo）': 'No LoadVideo node found',
  '未找到图像加载节点（LoadImage）': 'No LoadImage node found',
  '未找到文本输入节点': 'No text input node found',
  '未找到音频加载节点': 'No audio loading node found',
  '文本节点': 'Text Node',
  '文档中没有找到有效的文本内容': 'No valid text was found in the document',
  '文件格式错误：必须是收藏列表': 'Invalid file format: expected a favorites list',
  '文件夹': 'Folder',
  '文件夹中没有找到视频文件': 'No video files found in the folder',
  '文件夹中没有找到图片文件': 'No image files found in the folder',
  '文件夹中没有找到音频文件': 'No audio files found in the folder',
  '现有': 'Existing',
  '新建': 'New',
  '选择 API Key': 'Select API Key',
  '选择批量传视频的目标节点': 'Select the target node for batch video input',
  '选择批量传图的目标节点': 'Select the target node for batch image input',
  '选择批量传音频的目标节点': 'Select the target node for batch audio input',
  '选择批量导入文本的目标节点': 'Select the target node for batch text input',
  '已取消收藏': 'Removed from favorites',
  '已删除失效收藏': 'Invalid favorite removed',
  '已停止当前调度的追踪，服务端已提交的任务可能仍在运行。': 'Current scheduling tracking stopped. Submitted server tasks may still be running.',
  '已停止追踪，服务端已提交的任务可能仍在运行': 'Tracking stopped. Submitted server tasks may still be running.',
  '已选择图片': 'Image Selected',
  '已有调度正在运行，请等待当前调度结束后再启动新的任务。': 'A schedule is already running. Wait for it to finish before starting another task.',
  '应用已加载': 'App Loaded',
  '运行此任务': 'Run This Task',
  '暂无记录': 'No records yet',
  '暂无批量配置': 'No batch configurations yet',
  '正在提交任务': 'Submitting Task',
  '正在提交任务...': 'Submitting Task...',
  '执行中': 'Running',
  '自动保存目录的访问权限已过期，请重新选择目录。': 'Auto-save folder access has expired. Choose the folder again.',
  '自动分配卡片任务与轮询。': 'Assigns card tasks and polling automatically.',
  'API 并发暂时已满，已自动等待后重试。': 'API concurrency is full. Waiting to retry automatically.',
};

const EN_PATTERNS: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [/^消费级 API (\d+)$/, match => `Consumer API ${match[1]}`],
  [/^并发 (\d+)$/, match => `Concurrency ${match[1]}`],
  [/^任务 (\d+)$/, match => `Task ${match[1]}`],
  [/^任务配置 #(\d+)$/, match => `Task Configuration #${match[1]}`],
  [/^已强制所有请求使用国内站，可随时切回自动。$/, 'All requests are forced to use the China region. You can switch back to Auto at any time.'],
  [/^已强制所有请求使用海外站，可随时切回自动。$/, 'All requests are forced to use the Global region. You can switch back to Auto at any time.'],
  [/^共 (\d+) 个结果$/, match => `${match[1]} results`],
  [/^(\d+) 个参数$/, match => `${match[1]} parameters`],
  [/^(\d+) 个节点$/, match => `${match[1]} nodes`],
  [/^(\d+) 个任务$/, match => `${match[1]} tasks`],
  [/^(图像|视频|音频|文本|文件) (\d+)$/, match => `${EN_TRANSLATIONS[match[1]] || match[1]} ${match[2]}`],
  [/^任务 (\d+) 执行失败$/, match => `Task ${match[1]} failed`],
  [/^任务 (\d+) 执行完成$/, match => `Task ${match[1]} completed`],
  [/^任务 (\d+) 排队中$/, match => `Task ${match[1]} queued`],
  [/^任务 (\d+) 执行中$/, match => `Task ${match[1]} running`],
  [/^以下任务失败 \((\d+) 个\)$/, match => `Failed tasks (${match[1]})`],
  [/^重新提交失败任务 \((\d+) 个\)$/, match => `Retry failed tasks (${match[1]})`],
  [/^当前并发槽位\s*(\d+)$/, match => `Current concurrency slots: ${match[1]}`],
  [/^草稿“(.+)”$/, match => `Draft “${match[1]}”`],
  [/^已保存草稿“(.+)”$/, match => `Saved draft “${match[1]}”`],
  [/^剩余\s*(.+)$/, match => `Remaining ${match[1]}`],
  [/^农历\s*(.+)$/, match => `Lunar ${match[1]}`],
];

const normalizeTranslationKey = (value: string) => value.replace(/\s+/g, ' ').trim();

export const translateUiText = (value: string, language: AppLanguage = 'en'): string => {
  if (language === 'zh' || !/[\u3400-\u9fff]/.test(value)) return value;

  const leading = value.match(/^\s*/)?.[0] || '';
  const trailing = value.match(/\s*$/)?.[0] || '';
  const normalized = normalizeTranslationKey(value);
  const direct = EN_TRANSLATIONS[normalized];
  if (direct) return `${leading}${direct}${trailing}`;

  for (const [pattern, replacement] of EN_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const translated = typeof replacement === 'string' ? replacement : replacement(match);
    return `${leading}${translated}${trailing}`;
  }

  return value;
};

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  text: (zh: string, en?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'zh',
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  text: zh => zh,
});

interface TrackedText {
  source: string;
  translated: string;
}

interface TrackedAttribute {
  source: string;
  translated: string;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;

const shouldIgnoreElement = (element: Element | null) => {
  if (!element) return true;
  if (element.closest('[data-i18n-ignore="true"]')) return true;
  return ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(element.tagName);
};

const localizeDocument = (root: HTMLElement) => {
  const trackedTextNodes = new Map<Text, TrackedText>();
  const trackedAttributes = new Map<Element, Map<string, TrackedAttribute>>();

  const localizeTextNode = (node: Text) => {
    if (shouldIgnoreElement(node.parentElement)) return;
    const current = node.nodeValue || '';
    const tracked = trackedTextNodes.get(node);
    if (tracked && current === tracked.translated) return;

    const source = current;
    const translated = translateUiText(source, 'en');
    trackedTextNodes.set(node, { source, translated });
    if (translated !== current) node.nodeValue = translated;
  };

  const localizeAttribute = (element: Element, attribute: string) => {
    if (shouldIgnoreElement(element)) return;
    const current = element.getAttribute(attribute);
    if (!current) return;

    const elementAttributes = trackedAttributes.get(element) || new Map<string, TrackedAttribute>();
    const tracked = elementAttributes.get(attribute);
    if (tracked && current === tracked.translated) return;

    const translated = translateUiText(current, 'en');
    elementAttributes.set(attribute, { source: current, translated });
    trackedAttributes.set(element, elementAttributes);
    if (translated !== current) element.setAttribute(attribute, translated);
  };

  const localizeNode = (node: Node) => {
    if (node.nodeType === TEXT_NODE) {
      localizeTextNode(node as Text);
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;

    const element = node as Element;
    if (shouldIgnoreElement(element)) return;
    TRANSLATABLE_ATTRIBUTES.forEach(attribute => localizeAttribute(element, attribute));
    element.childNodes.forEach(localizeNode);
  };

  localizeNode(root);

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'characterData') {
        localizeTextNode(mutation.target as Text);
        return;
      }
      if (mutation.type === 'attributes' && mutation.target.nodeType === ELEMENT_NODE && mutation.attributeName) {
        localizeAttribute(mutation.target as Element, mutation.attributeName);
        return;
      }
      mutation.addedNodes.forEach(localizeNode);
    });
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });

  return () => {
    observer.disconnect();
    trackedTextNodes.forEach((tracked, node) => {
      if (node.isConnected && node.nodeValue === tracked.translated) node.nodeValue = tracked.source;
    });
    trackedAttributes.forEach((attributes, element) => {
      if (!element.isConnected) return;
      attributes.forEach((tracked, attribute) => {
        if (element.getAttribute(attribute) === tracked.translated) element.setAttribute(attribute, tracked.source);
      });
    });
  };
};

export const LanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // Keep the in-memory language when storage is unavailable.
    }
  };

  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = language === 'en' ? 'RunningHub AI Client' : 'RunningHub AI 应用客户端';
    if (language !== 'en') return;

    const root = document.getElementById('root');
    if (!root) return;
    return localizeDocument(root);
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(language === 'zh' ? 'en' : 'zh'),
    text: (zh, en) => language === 'zh' ? zh : en || translateUiText(zh, 'en'),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextValue => {
  return useContext(LanguageContext);
};
