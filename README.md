# 砚

> 一面面向推免申请的智能镜子：把分散的通知、材料、时间线和个人档案照清楚，让申请从“到处找文件”变成“按要求稳稳推进”。

砚是一个本地优先的推免申请材料管理与打包工具。它面向 2026 届推免申请场景，把院校通知解析、材料清单抽取、已有文件复用、缺漏检查、档案管理、资讯追踪和 PDF/ZIP 导出放在同一个工作台里。

项目不是想替代人的判断，而是把最容易出错、最耗心力的流程整理出来：哪些材料必须交、哪些需要盖章、哪些有页数限制、哪个文件已经可以复用、最后导出时是否能按院校要求形成一套完整材料包。

## Why It Exists

推免申请的问题往往不在“不会准备”，而在信息太碎：

| 真实痛点 | 砚的回答 |
| --- | --- |
| 每个学院通知格式不同，材料要求藏在长文里 | 解析通知，抽取院校、学院、时间线、材料清单和来源段落 |
| 同一份文件会被多所学校反复使用 | 建立个人档案柜，已有文件可直接绑定到新的材料要求 |
| 申请表、成绩单、身份证、个人陈述容易漏交 | 对每一条材料要求给出 `缺失`、`待修正`、`已就绪` 状态 |
| 盖章、页数、份数等细节容易忽略 | 匹配时检查原件扫描、盖章要求、页数限制、数量要求 |
| 导出前才发现材料顺序混乱 | 按通知中的材料顺序生成 ZIP 或 PDF 目录包 |
| API Key、上传材料不适合放到云端 | 配置、本地数据库、上传文件默认留在本机，并被 `.gitignore` 排除 |

## Core Ideas

砚的设计思考可以概括成四句话：

1. **本地优先**  
   申请材料、个人信息、上传文件和 API Key 都应先属于用户自己。项目默认使用本地 JSON 数据库和本地上传目录，不依赖远程数据库。

2. **可追溯，而不是“看起来很智能”**  
   解析出的材料要求会保留原文 block 来源。用户可以回到通知原文核对，不把 AI 或规则解析当成不可质疑的黑箱。

3. **AI 辅助，但不把流程交给 AI**  
   配置了大模型时，系统会尝试用 OpenAI-compatible 或智谱接口增强解析；没有配置或调用失败时，仍然用本地规则兜底。

4. **申请是一个流程，不是一张静态清单**  
   项目把“资讯 -> 通知 -> 材料 -> 档案 -> 检查 -> 导出”串成闭环，让每一步都能继续推进，而不是只给一个孤立的待办列表。

## Feature Map

### 1. 保研资讯

- 抓取并展示保研信息源
- 记录更新时间与缓存状态
- 支持按项目类型筛选
- 可将资讯导入为一个申请项目，再补充正式通知原文

### 2. 科技热点

- 抓取量子位、机器之心等技术资讯
- 只保留 2026 年相关条目
- 自动推断话题，如 AI Agent、大模型、具身智能等
- 网络受限或抓取失败时使用缓存展示

### 3. 申请材料工作台

- 粘贴院校通知，自动解析：
  - 基本信息
  - 时间安排
  - 申请要求
  - 材料清单
  - 原文来源 block
- 按材料逐项上传文件
- 从个人档案柜选择已上传文件复用
- 对每条材料显示状态：
  - `缺失`
  - `待补充或修正`
  - `已就绪`
  - `可选未提交`
- 支持手动绑定文件，手动选择优先于自动名称匹配

### 4. 个人档案与进度

- 维护常用材料：
  - 成绩单
  - 排名证明
  - 英语水平证明
  - 身份证
  - 学生证
  - 推荐信
  - 个人陈述
  - 简历
  - 科研成果材料
- 多申请项目进度总览
- 删除申请项目或档案材料
- 替换已上传文件
- 上传并管理校徽资源

### 5. PDF / ZIP 导出

- ZIP：按材料顺序整理原始文件，缺失项生成说明文件
- PDF：生成封面、目录，并合并已上传 PDF 材料
- 自动查找中文字体，支持配置自定义字体
- 支持校徽映射与自动查找
- 导出文件进入 `exports/`，默认不提交到 GitHub

## How It Works

```text
院校通知 / 资讯导入
        |
        v
本地规则解析 + 可选 AI 增强
        |
        v
结构化申请项目
        |
        v
材料要求 <-> 个人档案 / 本次上传文件
        |
        v
匹配检查：缺失、盖章、页数、数量、形式
        |
        v
PDF 或 ZIP 导出
```

## Tech Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 20+ |
| Backend | Native Node HTTP server |
| Frontend | Static SPA: HTML / CSS / JavaScript |
| Storage | Local JSON file: `data/db.json` |
| Uploads | Local folder: `uploads/` |
| Export | `pdf-lib` + `@pdf-lib/fontkit` |
| AI | OpenAI-compatible Chat Completions API, optional Zhipu configuration |

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local configuration file:

```powershell
Copy-Item config/app.example.json config/app.local.json
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:5178
```

If port `5178` is already in use:

```powershell
$env:PORT=5180; npm run dev
```

## Configuration

Local private configuration lives in:

```text
config/app.local.json
```

Example:

```json
{
  "ai": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "your-api-key-here",
    "model": "gpt-4.1"
  },
  "storage": {
    "databaseFile": "data/db.json",
    "uploadsDir": "uploads",
    "exportsDir": "exports"
  },
  "profile": {
    "name": "你的姓名",
    "homeUniversity": "你的本科学校",
    "major": "你的本科专业",
    "targetMajor": "申请专业或方向",
    "submitDate": "2026-05-12"
  },
  "export": {
    "fontPath": "",
    "logoLibraryDir": "src/images",
    "logoMap": {
      "浙江大学": "src/images/ZJU.png"
    }
  }
}
```

For Zhipu:

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

## Daily Workflow

1. 打开 `材料打包`
2. 粘贴院校通知，点击重新解析
3. 检查材料清单和原文来源
4. 对每一项材料上传文件，或选择已有文件
5. 回到 `个人档案与进度` 管理常用材料
6. 状态全部就绪后导出 PDF 或 ZIP
7. 导出前人工复核原文要求，尤其是盖章、页数、签字、命名规则

## Project Structure

```text
.
├─ config/
│  ├─ app.example.json
│  ├─ app.zhipu.example.json
│  └─ app.local.json          # private, ignored
├─ data/
│  └─ db.json                 # local data, ignored
├─ exports/                   # generated exports, ignored
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ src/
│  ├─ server.js
│  ├─ images/
│  └─ services/
│     ├─ ai-parser.js
│     ├─ config.js
│     ├─ crawler.js
│     ├─ exporter.js
│     ├─ matcher.js
│     ├─ parser.js
│     ├─ seed.js
│     └─ storage.js
├─ uploads/                   # uploaded files, ignored
├─ package.json
└─ README.md
```

## Matching Logic

砚的匹配不是简单地“文件名包含关键词”。

For each material requirement, the matcher checks:

- 是否有手动绑定文件
- 是否有标准名一致的档案材料
- 是否为当前申请专属文件
- 是否满足要求的材料形式，如原件扫描、复印件、电子版
- 是否满足盖章要求
- 是否超过页数或字数限制
- 是否满足份数要求

手动选择已有文件时，用户意图优先。也就是说，即使文件标准名不完全一致，只要用户在下拉框里明确选择了它，它也会参与当前材料项的校验与导出。

## Privacy Notes

The following paths are intentionally ignored by Git:

```text
config/app.local.json
data/db.json
data/db.backup-*.json
uploads/
exports/
node_modules/
*.log
```

Do not commit real API keys, personal application data, uploaded PDFs, or generated export packages.

The frontend only receives whether an API key is configured. The key itself stays in local config and is not returned by `/api/state`.

## API Overview

| Endpoint | Purpose |
| --- | --- |
| `GET /api/state` | Load public app state with computed match results |
| `GET /api/config` | Load public config summary |
| `POST /api/notice/parse` | Parse pasted notice into a structured application |
| `POST /api/documents` | Create a document record and optionally upload content |
| `POST /api/documents/link` | Bind an existing document to a material requirement |
| `POST /api/documents/upload` | Replace the file attached to an existing document |
| `POST /api/export` | Generate PDF or ZIP export |
| `POST /api/news/refresh` | Refresh baoyan news |
| `POST /api/tech/refresh` | Refresh technology hotspots |
| `POST /api/privacy/clear-exports` | Clear generated export files |

## Design Principles

- **清晰优先**：复杂流程拆成可理解的步骤。
- **人工可控**：解析、匹配、绑定、导出都允许用户检查和修正。
- **渐进增强**：有 AI 更好，没有 AI 也能运行。
- **失败可恢复**：网络抓取失败时使用缓存，AI 失败时使用本地规则。
- **数据克制**：只保存完成流程所需的信息，敏感文件默认不上传到仓库。

## Roadmap

- 更完整的 DOC/DOCX 文本解析
- 更细的材料命名模板
- 导出前检查报告
- 多申请项目间的材料复用建议
- 更强的中文编码与来源网页清洗
- 可视化时间线和截止日期提醒

## License

This project is currently a private prototype. Add a license before distributing it publicly.
