# AI应用完整接入示例高阶版

# RunningHub AI 应用界面（交互使用脚本高级版）使用手册

## 1. 系统需求与运行环境

### 1.1 服务器环境

| 组件        | 要求                                           |
| --------- | -------------------------------------------- |
| Python 版本 | Python 3.8+                                  |
| 依赖库       | `pip install flask requests`                 |

### 1.2 前端环境

| 项目   | 要求                                       |
| ---- | ---------------------------------------- |
| 浏览器  | 推荐 Chrome、Edge、Firefox 最新版本              |
| 本地显示 | 前端界面为 HTML + JS，直接通过 Flask 提供的 HTTP 服务访问 |
| 文件上传 | 图片、音频、视频、ZIP 等文件需小于服务端允许大小（runninghub平台规定 <30MB）    |

### 1.3 项目目录结构

```
project/
│
├── app.py              # Flask 后端脚本
├── index.html          # 前端界面
└── uploads/            # 可选：用于保存上传文件（可由 Flask 动态管理）
```
---

## 2. 后端配置与启动

### 2.1 配置 API Key 与 WebAppId

* **API Key**：由 RunningHub 平台提供，用于接口鉴权
* **WebAppId**：对应你在 RunningHub 创建的 AI 应用实例

### 2.2 启动 Flask 服务

打开终端或命令行，进入项目目录，执行启动命令：

```bash
python app.py
```

默认 Flask 服务监听 `0.0.0.0:5000`，在浏览器访问：

```
http://localhost:5000/find
```

即可打开前端界面 `index.html`

---

## 3. 前端界面操作说明


![5440e95f-4302-4957-8c12-dc602c1f02a2.png](https://api.apifox.com/api/v1/projects/6103976/resources/583087/image-preview)
### 3.1 API Key 与 WebAppId 输入

1. 页面顶部输入：

   * **API Key**：RunningHub 平台提供的密钥
   * **WebAppId**：AI 应用实例 ID
2. 点击 **获取节点信息**：

   * 前端通过 `/get_node_info` 请求后端
   * 后端返回节点列表和封面图
3. 页面左侧渲染节点信息，右侧显示封面

### 3.2 节点信息操作

#### 节点类型说明

| 节点类型                  | 操作方式          |
| --------------------- | ------------- |
| STRING                | 文本输入框，可输入字符串  |
| LIST                  | 下拉选择框，可从选项中选择 |
| IMAGE / AUDIO / VIDEO | 媒体文件上传与预览     |

#### 节点操作

* **文本输入**：直接在 `textarea` 中输入内容
* **选择列表**：在下拉框选择对应选项
* **文件上传**：

  1. 点击 **上传文件** 按钮
  2. 选择本地文件（支持 IMAGE/AUDIO/VIDEO/ZIP）
  3. 上传后自动显示预览，并将文件路径更新到节点信息中

### 3.3 运行 AI 应用

* 所有节点填写完成后，点击 **运行 Ai 应用** 按钮
* 前端将节点信息 (`nodeInfoList2`) 发送到 `/save_nodes`
* 后端提交任务到 RunningHub 平台
* 页面右侧显示任务执行状态和生成结果

#### 文件预览和下载支持

| 文件类型 | 预览方式   |
| ---- | ------ |
| 图片   | 直接显示预览 |
| 音视频  | 预览  |
| 其他文件 | 提供下载链接 |

---

## 4. 后端功能说明

### 4.1 /get_node_info

| 项目   | 说明                                                               |
| ---- | ---------------------------------------------------------------- |
| 请求方式 | POST                                                             |
| 参数   | `{ "apiKey": "<your_api_key>", "webappId": "<your_webapp_id>" }` |
| 功能   | 获取当前 AI 应用的节点列表和封面图                                              |
| 返回   | 节点信息列表（nodeInfoList）、封面图列表（covers）                               |

### 4.2 /upload_file

| 项目   | 说明                                                    |
| ---- | ----------------------------------------------------- |
| 请求方式 | POST                                                  |
| 表单字段 | `file`：待上传文件；`fileType`：文件类型（image/audio/video/input） |
| 功能   | 将文件上传到 RunningHub 平台，并返回文件路径                          |
| 返回   | `{ "success": true, "thirdPartyResponse": {...} }`    |

### 4.3 /save_nodes

| 项目   | 说明                                                                                       |
| ---- | ---------------------------------------------------------------------------------------- |
| 请求方式 | POST                                                                                     |
| 参数   | `{ "webappId": "<your_webapp_id>", "nodeInfoList2": [...], "apiKey": "<your_api_key>" }` |
| 功能   | 提交 AI 任务到 RunningHub，轮询任务状态，返回任务生成结果                                                     |
| 状态   | 运行中、排队、成功、失败                                                                             |

### 4.4 /find

直接返回 `index.html` 页面，用于浏览器访问前端

---

## 5. 文件上传与下载注意事项

* 前端上传文件时，会调用 `/upload_file` 上传至第三方服务器
* **支持文件类型**：

  * IMAGE：jpg、png、webp
  * AUDIO：mp3、wav
  * VIDEO：mp4、avi、mov
  * ZIP 或其他类型：以下载链接提供
* 上传成功后，会更新节点信息的 `fieldValue` 为文件服务器路径

---

## 6. 常见问题与解决方案

| 问题       | 可能原因                  | 解决方案                 |
| -------- | --------------------- | -------------------- |
| 无法获取节点信息 | API Key 或 WebAppId 错误 | 确认输入正确，重新获取          |
| 上传文件失败   | 网络异常或文件类型不支持          | 检查网络，确认文件类型          |
| 任务长时间未完成 | 后端轮询超时或服务繁忙           | 可增加 timeout 时间，或重试任务 |
| 文件预览无法显示 | 浏览器不支持格式或 URL 不正确     | 检查文件类型，尝试下载查看        |

---

## 7. 小技巧与建议

* 📷 **图片上传**：尽量压缩到 1-5MB，避免长时间上传
* 🎬 **视频处理**：控制在 30MB 内，浏览器预览更流畅
* 💾 **文件管理**：任务提交后，可在右侧结果区域查看文件链接，方便下载备份
* ⚡ **LIST 节点**：选择正确 option 可影响 AI 应用生成结果

---

## ✅ 系统总结

该自动化脚本高级版界面实现了完整的功能流程：

* 🔄 节点信息动态渲染
* 📤 文件上传与预览
* 🚀 AI 应用任务提交与轮询
* 📥 文件生成结果显示与下载

整个系统前端通过 HTML/JS 渲染节点，后端使用 Flask 提供 API 接口并对接 RunningHub 平台，用户只需配置 API Key 和 WebAppId 即可运行完整流程。
`后端代码`
```python
from flask import Flask, request, jsonify,send_from_directory
import os
import http.client
import mimetypes
from codecs import encode
import json
import time
import requests
app = Flask(__name__)

THIRD_PARTY_HOST = "www.runninghub.cn"
THIRD_PARTY_PATH = "/task/openapi/upload"
webappId = "1937084629516193794"
@app.route('/find')
def index():
    # 返回自己当前目录下的 index.html
    return send_from_directory(os.getcwd(), 'index.html')


API_HOST = "www.runninghub.cn"
API_KEY = ""

# 1️⃣ 提交任务
def submit_task(webapp_id, node_info_list):
    conn = http.client.HTTPSConnection(API_HOST)
    payload = json.dumps({
        "webappId": webapp_id,
        "apiKey": API_KEY,
        # "quickCreateCode": quick_create_code,
        "nodeInfoList": node_info_list
    })
    headers = {
        'Host': API_HOST,
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/task/openapi/ai-app/run", payload, headers)
    res = conn.getresponse()
    data = json.loads(res.read().decode("utf-8"))
    conn.close()
    return data


# 3️⃣ 查询任务生成结果
def query_task_outputs(task_id):
    conn = http.client.HTTPSConnection(API_HOST)
    payload = json.dumps({
        "apiKey": API_KEY,
        "taskId": task_id
    })
    headers = {
        'Host': API_HOST,
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/task/openapi/outputs", payload, headers)
    res = conn.getresponse()
    data = json.loads(res.read().decode("utf-8"))
    conn.close()
    return data
@app.route("/get_node_info", methods=["POST"])
def get_node_info():
    global API_KEY  # ✅ 声明要修改全局变量
    req = request.get_json()
    webappId = req.get("webappId")
    api_key = req.get("apiKey")  # 前端传过来的 apiKey
    print(api_key)
    API_KEY = api_key  # ✅ 更新全局 API_KEY
    if not api_key or not webappId:
        return jsonify({"success": False, "message": "缺少 apiKey 或 webappId"}), 400

    try:
        conn = http.client.HTTPSConnection("www.runninghub.cn")
        # 构造 GET 请求 URL
        url = f"/api/webapp/apiCallDemo?apiKey={api_key}&webappId={webappId}"
        conn.request("GET", url, headers={})
        res = conn.getresponse()
        data = res.read()
        conn.close()

        # 解析 JSON
        try:
            result = json.loads(data.decode("utf-8"))
        except ValueError:
            result = {"success": False, "message": "第三方返回非 JSON 数据", "data": data.decode("utf-8")}

        return jsonify(result)

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/upload_file", methods=["POST"])
def upload_file():
    # 从前端接收文件
    file = request.files.get('file')
    if not file:
        return jsonify({"success": False, "message": "未收到文件"})

    file_type = request.form.get('fileType', 'input')  # 从前端获取文件类型

    url = "https://www.runninghub.cn/task/openapi/upload"
    headers = {'Host': 'www.runninghub.cn'}
    data = {'apiKey': API_KEY, 'fileType': file_type}

    # 直接把上传的文件对象传给第三方
    files = {'file': (file.filename, file.stream, file.content_type)}

    response = requests.post(url, headers=headers, files=files, data=data)

    # 尝试解析第三方返回的 JSON
    try:
        third_party_data = response.json()
    except ValueError:
        third_party_data = response.text

    return jsonify({"success": True, "thirdPartyResponse": third_party_data})

# 接收前端 nodeInfoList2
@app.route("/save_nodes", methods=["POST"])
def save_nodes():
    req = request.get_json()
    node_info_list = req.get("nodeInfoList2")
    webappId = req.get("webappId")
    api_key = req.get("apiKey")  # 前端传过来的 apiKey
    print(api_key)
    if api_key:
        API_KEY = api_key  # ✅ 更新全局 API_KEY
    if not node_info_list:
        return jsonify({"success": False, "message": "nodeInfoList2 为空"}), 400

    try:
        # 提交任务
        submit_result = submit_task(webappId, node_info_list)
        if submit_result.get("code") != 0:
            return jsonify({"success": False, "message": "任务提交失败", "data": submit_result})

        task_id = submit_result["data"]["taskId"]

        """轮询任务执行结果，返回统一格式结果"""
        start_time = time.time()
        timeout = 600
        while True:
            outputs_result = query_task_outputs(task_id)
            code = outputs_result.get("code")
            msg = outputs_result.get("msg")
            data = outputs_result.get("data")
            # 成功
            if code == 0 and data:
                print("🎉 生成结果完成！")
                print(data)
                return {
                    "success": True,
                    "fileUrl": data,  # 与 Flask 返回一致
                    "taskId": task_id,
                    "message": msg or "success"
                }
            # 任务失败
            elif code == 805:
                failed_reason = data.get("failedReason") if data else None
                print("❌ 任务失败！")
                if failed_reason:
                    print(f"节点 {failed_reason.get('node_name')} 失败原因: {failed_reason.get('exception_message')}")
                    print("Traceback:", failed_reason.get("traceback"))
                return {
                    "success": False,
                    "message": "任务执行失败",
                    "data": outputs_result
                }
            # 运行中或排队中
            elif code in (804, 813):
                status_text = "运行中" if code == 804 else "排队中"
                print(f"⏳ 任务{status_text}...")

            else:
                print("⚠️ 未知状态:", outputs_result)

            # 超时检查
            if time.time() - start_time > timeout:
                print("⏰ 等待超时（超过10分钟），任务未完成。")
                return {
                    "success": False,
                    "message": "等待超时（超过10分钟）",
                    "data": outputs_result
                }
            time.sleep(5)

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
```
`前端代码`
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Node Info 动态渲染示例</title>
  <style>
    body {
      font-family: "Microsoft YaHei", sans-serif;
      margin: 0;
      padding: 20px;
      background: #f8f8f8;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      box-sizing: border-box;
    }

    /* 左右两列各占50% */
    #container {
      width: 50%;
      padding-right: 20px;
      box-sizing: border-box;
    }
    #cover {
      width: 50%;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      position: sticky;
      top: 20px;
    }

    #cover img {
      width: 90%;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      background-color: #fff;
    }

    .node {
      background: #fff;
      border-radius: 10px;
      padding: 15px;
      margin-bottom: 20px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }

    .node h3 {
      margin: 0 0 10px;
      color: #333;
    }

    label {
      font-weight: bold;
      display: block;
      margin-top: 8px;
    }

    select, input[type=text], textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 6px;
      margin-top: 5px;
    }

    textarea {
      resize: vertical;
      min-height: 80px;
    }

    .desc {
      color: #666;
      font-size: 14px;
      margin-top: 4px;
    }

    .image-box {
      position: relative;
      width: 100%;
      max-width: 300px;
      border: 2px dashed #ccc;
      border-radius: 8px;
      overflow: hidden;
      background-color: #f0f0f0;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      transition: all 0.3s;
      margin-top: 10px;
    }
    .image-box:hover { border-color: #66aaff; }
    .image-box img { width: 100%; height: 100%; object-fit: cover; display: block; }

    #saveBtn {
      background-color: #4a90e2; /* 深蓝色 */
      color: #fff;
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      transition: background-color 0.3s;
    }

    #saveBtn.saved {
      background-color: #a0c4ff; /* 浅蓝色 */
    }
  </style>
</head>
<body>
<!-- 1️⃣ 最上方 WebAppId 输入框和按钮 -->
  <!-- 顶部控制区 -->
  <div id="controls" style="margin-bottom: 20px;">
    <label>API Key: </label>
    <input type="text" id="apiKeyInput" placeholder="请输入 API Key" style="width: 260px;" />
    <br><br>
    <label>WebAppId: </label>
    <input type="text" id="webappIdInput" placeholder="请输入 WebAppId" style="width: 260px;" />
    <button id="fetchBtn">获取节点信息</button>
  </div>
<body>
  <!-- 左侧容器 -->
  <div id="container"></div>

  <!-- 右侧容器：封面 + 结果 -->
  <div id="rightSide" style="display: flex; flex-direction: column; width: 50%; align-items: center;">
    <!-- 封面 -->
    <div id="cover" style="position: relative; width: 300px;">
      <span style="
        position: absolute;
        top: 8px;
        left: 8px;
        background-color: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-size: 14px;
        padding: 4px 8px;
        border-radius: 4px;
      ">封面图</span>

    <img src="" alt="封面" style="width: 100%; border-radius: 8px;" />
    </div>

    <!-- 结果信息 -->
    <div id="resultBox" style="margin-top: 12px; text-align: left; width: 300px;"></div>
  </div>
</body>

<script>
const defaultImage = "";
let API_KEY = ""; // 替换成你的 API Key
// ✅ 全局保存 WebAppId
let currentWebAppId = "";
const coverImg = document.querySelector("#cover img");
const nodeInfoList = [];
const container = document.getElementById("container");
let currentAspectRatio = "1:1";
let imageBox = null;
// 获取节点信息
document.getElementById("fetchBtn").addEventListener("click", async () => {
    API_KEY = document.getElementById("apiKeyInput").value.trim();
  // ✅ 获取输入框的值并保存到全局变量
  currentWebAppId = document.getElementById("webappIdInput").value.trim();

  // ✅ 用全局变量判断是否为空
  if (!currentWebAppId) return alert("请输入 WebAppId");

  try {
    // ✅ 用全局变量发送请求
      const response = await fetch("/get_node_info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: API_KEY,
        webappId: currentWebAppId
      })
    });
    const result = await response.json();

    if (result.code !== 0) return alert("接口请求失败：" + result.msg);

    // 更新全局 nodeInfoList
    nodeInfoList.length = 0; // 清空原有数据
    nodeInfoList.push(...(result.data.nodeInfoList || []));
    console.log(nodeInfoList);

    // 设置封面图
    if (result.data?.covers?.length > 0) {
      coverImg.src = result.data.covers[0].thumbnailUri;
    } else {
      coverImg.src = "";
    }
   renderNodeInfoList(); // ✅ 渲染节点
    finddd()
  } catch (err) {
    console.error(err);
    alert("请求出错，请查看控制台");
  }
});

function renderNodeInfoList() {
    container.innerHTML = "";
      nodeInfoList.forEach(node => {
      const div = document.createElement("div");
      div.className = "node";

      const header = document.createElement("h3");
      header.textContent = `nodeName：${node.nodeName}（nodeId: ${node.nodeId}）`;
      div.appendChild(header);

      const desc = document.createElement("label");
      // desc.className = "desc";
      desc.textContent = `Description：${node.description}（DescriptionEn: ${node.descriptionEn}）`;
      div.appendChild(desc);

    const label = document.createElement("label");
    label.textContent = `fieldName：${node.fieldName}（fieldType: ${node.fieldType}）`;
    div.appendChild(label);

    const find1 = document.createElement("label");
    find1.textContent = `fieldType：${node.fieldType}（如果是fieldType是LIST的话，需要关注fieldData字段，fieldData值为选择框的所有信息）`;
    div.appendChild(find1);

    const find2 = document.createElement("label");
    find2.textContent = `fieldValue：${''}`
    div.appendChild(find2);
    if (node.fieldType === "LIST") {
      let options = [];
      try {
        options = JSON.parse(node.fieldData);
      } catch (e) {
        console.error(e);
      }

      const select = document.createElement("select");
      options.forEach(opt => {
        if (opt.name && opt.index) {
          const option = document.createElement("option");
          option.value = opt.index;
          option.textContent = `${opt.name} - ${opt.description || ''}`;
          console.log("全局 nodeInfoList 当前值:", nodeInfoList);
          if (opt.index === node.fieldValue) option.selected = true;
          select.appendChild(option);
        }
      });
      div.appendChild(select);

      // ✅ 添加 change 监听器
      select.addEventListener("change", () => {
        console.log("当前选择的值:", select.value);
        console.log("当前选择的文本:", select.options[select.selectedIndex].text);

        if (node.fieldName === "aspect_ratio") {
          currentAspectRatio = select.value;
          if (imageBox) updateImageBoxRatio(imageBox, currentAspectRatio);
          console.log("全局 nodeInfoList 当前值:", nodeInfoList);
        }
      });

    } else if (node.fieldType === "STRING") {
      const textarea = document.createElement("textarea");
      textarea.value = node.fieldValue || "";
      div.appendChild(textarea);
        // ✅ 监听输入事件，实时打印内容
      textarea.addEventListener("input", () => {
        console.log("当前输入的内容:", textarea.value);
        node.fieldValue = textarea.value; // 可选：实时更新 node 值
          console.log("全局 nodeInfoList 当前值:", nodeInfoList);
      });
    }
    else if (["IMAGE", "AUDIO", "VIDEO"].includes(node.fieldType)) {
      // 创建上传容器
      const mediaBox = document.createElement("div");
      mediaBox.className = "media-box";
      mediaBox.style.marginTop = "8px";
      mediaBox.style.display = "flex";
      mediaBox.style.alignItems = "center";
      mediaBox.style.gap = "10px"; // 预览和按钮间距

      // 创建不同类型的预览组件
      let previewElement;
      if (node.fieldType === "IMAGE") {
        previewElement = document.createElement("img");
        previewElement.src = node.fieldValue || defaultImage;
        previewElement.alt = node.fieldName;
        previewElement.style.width = "200px";
        previewElement.style.borderRadius = "8px";
      } else if (node.fieldType === "AUDIO") {
        previewElement = document.createElement("audio");
        previewElement.controls = true;
        if (node.fieldValue) previewElement.src = node.fieldValue;
        previewElement.style.width = "200px";
      } else if (node.fieldType === "VIDEO") {
        previewElement = document.createElement("video");
        previewElement.controls = true;
        if (node.fieldValue) previewElement.src = node.fieldValue;
        previewElement.style.width = "240px";
        previewElement.style.borderRadius = "8px";
      }

      mediaBox.appendChild(previewElement);

      // 创建上传 input
      const upload = document.createElement("input");
      upload.type = "file";

      if (node.fieldType === "IMAGE") upload.accept = "image/*";
      if (node.fieldType === "AUDIO") upload.accept = "audio/*";
      if (node.fieldType === "VIDEO") upload.accept = "video/*";
      upload.style.display = "none"; // 隐藏文件选择框

      // 创建上传按钮
      const uploadButton = document.createElement("button");
      uploadButton.textContent = "上传文件";
      uploadButton.addEventListener("click", () => upload.click());

        // 文件选择后的处理
    upload.addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;

      // --- 本地预览 ---
      const reader = new FileReader();
      reader.onload = ev => {
        previewElement.src = ev.target.result; // 显示本地文件
      };
      reader.readAsDataURL(file);
          // --- 上传到服务器 ---
          const formData = new FormData();
          formData.append("file", file);
          formData.append("fileType", node.fieldType.toLowerCase());

          try {
            const response = await fetch("/upload_file", {
              method: "POST",
              body: formData
            });
            const result = await response.json();

            if (result.success) {
              console.log("上传成功:", result);

              // --- 保存服务器返回的文件路径到节点 ---
              const data = result.thirdPartyResponse; // 不再 JSON.parse
              if (data.code === 0 && data.data && data.data.fileName) {
                node.fieldValue = data.data.fileName;
                console.log(`${node.fieldType} 文件更新为服务器路径:`, node.fieldValue);
                console.log("全局 nodeInfoList 当前值:", nodeInfoList);
              }
            } else {
              alert("上传失败: " + result.message);
            }
          } catch (err) {
            console.error("上传出错:", err);
            alert("上传出错，请查看控制台");
          }
        });

      mediaBox.appendChild(uploadButton); // 按钮放在预览旁边
      div.appendChild(mediaBox);
      div.appendChild(upload);
    }

      container.appendChild(div);
    });
}

function finddd()
{
    // 保存按钮
const saveBtn = document.createElement("button");
saveBtn.id = "saveBtn";
saveBtn.textContent = "运行Ai应用";
container.appendChild(saveBtn);

saveBtn.addEventListener("click", async () => {
    const nodeInfoList2 = nodeInfoList.map(node => {
        let updatedValue = node.fieldValue;

        // 找到对应的 DOM 节点
        const div = Array.from(container.querySelectorAll(".node")).find(d =>
            d.querySelector("h3")?.textContent.includes(node.nodeName)
        );

        if (div) {
           if (node.fieldType === "LIST") {
                const selects = Array.from(div.querySelectorAll("select"));
                // 根据 fieldName 匹配对应的 select
                const select = selects.find(s => {
                    // option 里可能没有标明 fieldName，所以通过 div 中 label 或描述匹配
                    const label = s.previousElementSibling; // 前一个 label
                    return label && label.textContent.includes(node.fieldName);
                });
                if (select) updatedValue = select.value;
            }else if (node.fieldType === "STRING") {
                const textarea = div.querySelector("textarea");
                if (textarea) updatedValue = textarea.value;
            }else if (["IMAGE", "AUDIO", "VIDEO"].includes(node.fieldType)) {
                // 直接使用节点保存的值
                updatedValue = node.fieldValue;
            }
        }

        // 构建节点对象
        const nodeObj = {
            nodeId: node.nodeId,
            fieldName: node.fieldName,
            fieldValue: updatedValue,
            description: node.description || ""
        };

        // 如果存在 fieldData，也加进去
        if (node.fieldType === "LIST") {
            nodeObj.fieldData = node.fieldData;
        }

        return nodeObj;
    });

    console.log("nodeInfoList2:", nodeInfoList2);
    // 发送到后端
    try {
        const response = await fetch("/save_nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeInfoList2,       // 节点信息列表
            webappId: currentWebAppId // 当前 WebAppId
          })
        });

      const result = await response.json();
      console.log("后端返回:", result);

    // ===== 显示返回信息到封面图下方 =====
    const coverDiv = document.getElementById("cover");
    let resultBox = document.getElementById("resultBox");

    // 如果没有 resultBox 就创建一个
    if (!resultBox) {
      resultBox = document.createElement("div");
      resultBox.id = "resultBox";
      resultBox.style.marginTop = "12px";
      resultBox.style.textAlign = "left";
      coverDiv.appendChild(resultBox);
    }

    if (result.success) {
        const files =
    result.thirdPartyResponse?.data ||
    result.data ||
    result.fileUrl; // ✅ 支持 fileUrl 数组

  console.log("后端返回文件列表:", files);

    if (Array.isArray(files) && files.length > 0) {
      let html = `<p><strong>任务 ID：</strong>${result.taskId || "-"}</p>`;
      html += `<p><strong>生成结果：</strong></p>`;

      files.forEach((file, i) => {
        console.log(`第${i + 1}个文件:`, file);
        html += `<div style="margin-bottom:12px;">`;
        const type = file.fileType?.toLowerCase() || "";

        if (["png", "jpg", "jpeg", "webp"].includes(type)) {
          html += `<img src="${file.fileUrl}" alt="生成图片${i + 1}"
            style="max-width:100%; border:1px solid #ccc; border-radius:6px; margin-top:8px;" />`;
        } else if (["mp4", "mov", "avi"].includes(type)) {
          html += `<video controls src="${file.fileUrl}"
            style="max-width:100%; border-radius:6px; margin-top:8px;"></video>`;
        } else if (["mp3", "wav"].includes(type)) {
          html += `<audio controls src="${file.fileUrl}"
            style="width:100%; margin-top:8px;"></audio>`;
        } else {
          html += `<a href="${file.fileUrl}" target="_blank">下载文件 ${i + 1}</a>`;
        }

        html += `<p><a href="${file.fileUrl}" target="_blank">👉 打开原文件 (${type})</a></p>`;
        html += `</div>`;
      });

      resultBox.innerHTML = html;
    } else {
      console.warn("⚠️ 未检测到文件数组:", result);
      resultBox.innerHTML = `<p style="color:red;">未检测到生成文件。</p>`;
    }

    } else {
      resultBox.innerHTML = `<p style="color:red;">任务提交失败：${result.message || "未知错误"}</p>`;
    }

    } catch (err) {
      console.error("保存到后端出错:", err);

      const coverDiv = document.getElementById("cover");
      let resultBox = document.getElementById("resultBox");
      if (!resultBox) {
        resultBox = document.createElement("div");
        resultBox.id = "resultBox";
        resultBox.style.marginTop = "12px";
        resultBox.style.textAlign = "left";
        coverDiv.appendChild(resultBox);
      }
      resultBox.innerHTML = `<p style="color:red;">请求出错，请检查控制台日志。</p>`;
    }
});
}

function updateImageBoxRatio(box, ratioStr) {
  if (!ratioStr || ratioStr === "match_input_image") {
    box.style.aspectRatio = "auto";
  } else if (ratioStr.includes(":")) {
    const [w, h] = ratioStr.split(":").map(Number);
    box.style.aspectRatio = `${w} / ${h}`;
  }
}
</script>

</body>
</html>

