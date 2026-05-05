# 砚

面向 2026 届推免申请的本地优先智能助手原型。当前版本使用 Node 原生后端、静态 SPA 前端，以及 `pdf-lib` 生成和合并申请材料 PDF。

## 启动

第一次使用先复制配置文件：

```powershell
Copy-Item config/app.example.json config/app.local.json
```

然后在 `config/app.local.json` 填写自己的 API Key、学生信息和导出设置：

```json
{
  "ai": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-your-api-key-here",
    "model": "gpt-4.1"
  },
  "profile": {
    "name": "你的姓名",
    "homeUniversity": "你的本科院校",
    "major": "你的本科专业",
    "targetMajor": "申请专业或方向",
    "submitDate": "2026-05-12"
  },
  "export": {
    "fontPath": "",
    "logoLibraryDir": "src/images",
    "logoMap": {
      "浙江大学": "logos/zhejiang-university.png"
    }
  }
}
```

如果使用智谱 API，可以直接参考 `config/app.zhipu.example.json`：

```json
{
  "ai": {
    "provider": "zhipu",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
    "apiKey": "your-zhipu-api-key-here",
    "model": "glm-5"
  }
}
```

启动服务：

```bash
npm run dev
```

打开 `http://localhost:5178`。

如果提示端口 `5178` 已被占用，可以换端口：

```powershell
$env:PORT=5180; npm run dev
```

## 开源注意

- `config/app.local.json` 是本地私有配置，已加入 `.gitignore`，不要提交真实 API Key。
- `config/app.example.json` 是给其他人上手用的模板，可以提交到 GitHub。
- 可见数据存储在 `data/db.json`，方便调试、备份和演示。
- 上传材料在 `uploads/`，导出结果在 `exports/`，默认不提交。

## PDF 导出

PDF 导出会生成一个完整的材料包：第 1 页是封面，第 2 页开始是目录，后面按通知材料清单顺序拼接已上传的 PDF 原文页面。目录会显示每份材料的文件名和起始页码。

学生姓名、本科院校、专业、申请方向和提交日期可在 `config/app.local.json` 的 `profile` 中修改，导出的 PDF 会自动使用这些信息。校徽可放到 `src/images/` 目录，并在 `export.logoMap` 里配置院校名到图片路径的映射；如果没有配置，系统会在 `export.logoLibraryDir`、`src/images`、`public/logos`、`data/logos`、`uploads` 中按院校名尝试查找 `.png/.jpg/.jpeg` 图片。校徽找不到不会影响导出。

中文字体默认会自动尝试系统常见字体。Windows 优先使用 `C:\Windows\Fonts\msyh.ttc`、`simhei.ttf`、`simsun.ttc`；Linux 会尝试 NotoSansCJK、WenQuanYi、SourceHanSans 等路径。如果系统找不到中文字体，可在 `export.fontPath` 指定一个本机中文字体文件。

## 已实现

- 保研资讯：抓取保研信息网，失败时显示缓存。
- 科技热点：抓取量子位、机器之心网页端资讯，仅保留发布时间在 2026 年的条目，受限时显示缓存。
- 材料打包：读取本地配置中的 AI、学生资料和 PDF 导出设置，通知解析后按材料要求逐项上传，或选择已上传文件复用，最后 PDF/ZIP 导出。
- 个人档案与进度：材料登记、多院校进度、缺漏状态。

## 设计原则

- 不编造：原文没有的字段一律标记为“需人工确认”。
- 可追溯：结构化字段保留来源 block，可在前端点击高亮原文。
- 本地优先：API Key 只保存在 `config/app.local.json`，后端不会把明文返回给前端。
- 失败可降级：爬虫失败时显示缓存数据与更新时间。
