# 砚

> 推免申请材料工作台。把通知、材料、档案、缺漏检查与导出整理到一处。

砚来自我参与清北复交人十几场推免面试、反复准备材料、核对通知、补交文件之后沉淀出的经验。推免流程里真正消耗人的，常常是那些细小却高风险的事情：一份成绩单有没有盖章，个人陈述是否超页，身份证正反面是否齐全，某个学院要求的材料是否已经在另一所学校用过。

这个项目希望把这些经验做成一个清楚、安静、可复用的工具。它帮助申请者把长通知拆成材料清单，把已有文件放进档案柜，把每一项要求标成可检查的状态，最后生成可以提交前复核的 PDF 或 ZIP 材料包。

愿它能帮后来的人少一点慌乱，多一点笃定。
<img width="2765" height="1456" alt="image" src="https://github.com/user-attachments/assets/92e5b87a-e95f-461e-9e8e-f166a6b7186a" />


## 功能

| 模块 | 能做什么 |
| --- | --- |
| 保研资讯 | 抓取保研信息源，筛选项目，导入为申请记录 |
| 科技热点 | 汇总量子位、机器之心等 2026 年技术资讯，辅助面试准备 |
| 通知解析 | 从院校通知中抽取院校、学院、时间线、申请要求和材料清单 |
| 材料工作台 | 按要求上传文件，或选择档案柜里的已有文件复用 |
| 缺漏检查 | 检查缺失、盖章、页数、份数、原件扫描等要求 |
| 个人档案 | 管理成绩单、排名证明、英语证明、身份证、学生证、推荐信、简历、个人陈述等常用材料 |
| 导出 | 生成 ZIP 原文件包，或生成带封面与目录的 PDF 材料包 |

## 使用流程

```text
粘贴院校通知
      |
      v
解析材料清单与时间线
      |
      v
逐项上传或复用已有文件
      |
      v
检查缺失、盖章、页数、份数
      |
      v
导出 PDF / ZIP，提交前人工复核
```

## 设计取向

- **本地优先**：个人信息、上传材料、API Key 默认留在本机。
- **来源可查**：结构化结果保留原文 block，方便回到通知里核对。
- **人工可控**：用户手动选择的材料拥有最高优先级。
- **渐进增强**：配置 AI 时增强解析；没有 AI 时继续使用本地规则。
- **面向复用**：同一份材料可以在多个申请项目之间反复绑定。
- **导出前清醒**：状态提示服务于复核，最终提交仍交给申请者判断。

## 技术栈

| 层 | 选择 |
| --- | --- |
| Runtime | Node.js 20+ |
| Backend | Node 原生 HTTP server |
| Frontend | 原生 HTML / CSS / JavaScript SPA |
| Storage | 本地 JSON：`data/db.json` |
| Uploads | 本地目录：`uploads/` |
| Export | `pdf-lib` + `@pdf-lib/fontkit` |
| AI | OpenAI-compatible Chat Completions，可选智谱配置 |

## 快速开始

安装依赖：

```bash
npm install
```

复制本地配置：

```powershell
Copy-Item config/app.example.json config/app.local.json
```

启动服务：

```bash
npm run dev
```

打开：

```text
http://localhost:5178
```

端口占用时可切换：

```powershell
$env:PORT=5180; npm run dev
```

## 配置

私有配置放在 `config/app.local.json`，此文件已被 `.gitignore` 排除。

```json
{
  "ai": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "your-api-key-here",
    "model": "gpt-4.1"
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

智谱配置可参考 `config/app.zhipu.example.json`：

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

## 目录

```text
.
├─ config/                  # 示例配置与本地私有配置
├─ data/                    # 本地数据
├─ exports/                 # 导出结果
├─ public/                  # 前端页面
├─ src/
│  ├─ server.js             # HTTP 服务与 API
│  ├─ images/               # 校徽资源
│  └─ services/
│     ├─ ai-parser.js       # AI 解析
│     ├─ config.js          # 配置读取
│     ├─ crawler.js         # 资讯抓取
│     ├─ exporter.js        # PDF / ZIP 导出
│     ├─ matcher.js         # 材料匹配与缺漏检查
│     ├─ parser.js          # 通知解析
│     ├─ seed.js            # 初始演示数据
│     └─ storage.js         # 本地状态存储
└─ uploads/                 # 上传文件
```

## 隐私

以下内容默认不提交到 Git：

```text
config/app.local.json
data/db.json
data/db.backup-*.json
uploads/
exports/
node_modules/
*.log
```

请勿提交真实 API Key、个人申请数据、上传材料或导出文件。前端只会知道 API Key 是否已配置，不会拿到明文 Key。

## 后续

- 更稳的 DOC / DOCX 文本解析
- 更细的材料命名模板
- 导出前检查报告
- 多申请项目之间的材料复用建议
- 截止日期提醒与时间线视图

## License

当前为个人原型项目。公开分发前请补充 License。
