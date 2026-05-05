export const defaultProfile = {
  name: "林知衡",
  homeUniversity: "东南大学",
  major: "计算机科学与技术",
  targetMajor: "计算机科学与技术",
  submitDate: "2026-05-12"
};

export const userDocuments = [
  {
    id: "doc-transcript",
    scope: "global",
    name: "本科成绩单",
    normalizedName: "本科成绩单",
    fileName: "本科成绩单.pdf",
    form: "original_scan",
    pageCount: 4,
    wordCount: 0,
    copyCount: 1,
    detectedSeals: ["教务处章"],
    statusNote: "教务处章",
    updatedAt: "2026-03-28T10:30:00.000Z"
  },
  {
    id: "doc-ranking",
    scope: "global",
    name: "专业排名证明",
    normalizedName: "专业排名证明",
    fileName: "专业排名证明.pdf",
    form: "original_scan",
    pageCount: 1,
    wordCount: 0,
    copyCount: 1,
    detectedSeals: ["院章"],
    statusNote: "院章",
    updatedAt: "2026-03-28T10:30:00.000Z"
  },
  {
    id: "doc-english",
    scope: "global",
    name: "英语水平证明",
    normalizedName: "英语水平证明",
    fileName: "CET6成绩单.pdf",
    form: "copy",
    pageCount: 1,
    wordCount: 0,
    copyCount: 1,
    detectedSeals: [],
    statusNote: "CET-6 481",
    updatedAt: "2026-03-28T10:30:00.000Z"
  },
  {
    id: "doc-id",
    scope: "global",
    name: "身份证复印件",
    normalizedName: "身份证复印件",
    fileName: "身份证.pdf",
    form: "copy",
    pageCount: 1,
    wordCount: 0,
    copyCount: 1,
    detectedSeals: [],
    statusNote: "正反面合并",
    updatedAt: "2026-03-28T10:30:00.000Z"
  },
  {
    id: "doc-student-card",
    scope: "global",
    name: "学生证复印件",
    normalizedName: "学生证复印件",
    fileName: "学生证.pdf",
    form: "copy",
    pageCount: 2,
    wordCount: 0,
    copyCount: 1,
    detectedSeals: [],
    statusNote: "缺注册章",
    updatedAt: "2026-03-28T10:30:00.000Z"
  },
  {
    id: "doc-rec-a",
    scope: "global",
    name: "专家推荐信 A",
    normalizedName: "专家推荐信",
    fileName: "张教授推荐信.pdf",
    form: "original_scan",
    pageCount: 1,
    wordCount: 0,
    copyCount: 1,
    detectedSeals: ["推荐人亲签"],
    statusNote: "张教授亲签",
    updatedAt: "2026-04-18T10:30:00.000Z"
  },
  {
    id: "doc-cv",
    scope: "global",
    name: "个人简历",
    normalizedName: "个人简历",
    fileName: "个人简历_v3.pdf",
    form: "electronic",
    pageCount: 2,
    wordCount: 1180,
    copyCount: 1,
    detectedSeals: [],
    statusNote: "v3.2",
    updatedAt: "2026-05-02T10:30:00.000Z"
  },
  {
    id: "doc-statement",
    scope: "school",
    schoolKey: "复旦大学",
    name: "个人陈述",
    normalizedName: "个人陈述",
    fileName: "复旦个人陈述.pdf",
    form: "electronic",
    pageCount: 3,
    wordCount: 1860,
    copyCount: 1,
    detectedSeals: ["本人签字"],
    statusNote: "已签字",
    updatedAt: "2026-05-03T10:30:00.000Z"
  }
];

export const sampleNoticeText = `复旦大学计算机科学技术学院 2026 年推免生招生简章

一、基本信息
复旦大学计算机科学技术学院拟接收 2026 年推荐免试硕士研究生，招生方向包括计算机系统、人工智能、数据科学与软件工程。

二、申请条件
申请人须为 2026 年应届本科毕业生，学习成绩优秀，专业排名原则上位于前 20%。英语水平良好，通过 CET-6 或具有同等英语能力证明。具有科研经历者优先。

三、申请材料
1. 推免申请表，须本人签字后提交电子版。
2. 本科成绩单原件扫描件，须加盖教务处章。
3. 专业排名证明原件扫描件，须加盖院章。
4. 英语水平证明复印件。
5. 专家推荐信 2 封，推荐人亲签。
6. 个人陈述，篇幅不超过 2 页，须本人签字。
7. 个人简历，不超过 2 页。
8. 身份证复印件、学生证复印件。
9. 获奖证书、论文或专利材料，如有可提交。

四、时间安排
报名时间：2026 年 5 月 6 日 9:00 至 2026 年 5 月 20 日 17:00。
初审结果将于 2026 年 5 月 25 日前公布。
面试时间：2026 年 5 月 28 日。
拟录取结果公示：2026 年 6 月 3 日。
`;

export const cachedBaoyanNews = [
  {
    id: "news-19476",
    title: "【复旦大学】——管理学院",
    publishedAt: "2026-05-05T03:52:04.000Z",
    university: "复旦大学",
    school: "管理学院",
    discipline: "未分类",
    projectType: "体验营",
    deadline: "2026-05-07",
    registrationStart: "2026-05-05",
    registrationEnd: "2026-05-07",
    activityStart: "2026-05-07",
    activityEnd: "2026-05-07",
    tags: ["宣讲会", "领创体验营", "2026"],
    url: "http://pc.baoyanwang.com.cn/articles/19476",
    officeUrl: "https://mp.weixin.qq.com/s/yETMDnL3-kj_zpNpENkmyA",
    summary: "聚焦5月7日双重节点：复旦管院上海宣讲会+领创体验营申请截止",
    structured: true,
    source: "保研信息网 API 缓存"
  },
  {
    id: "news-tsinghua-2026",
    title: "清华大学软件学院 2026 年推荐免试硕士研究生招生预报名通知",
    publishedAt: "2026-05-04T09:30:00.000Z",
    university: "清华大学",
    school: "软件学院",
    discipline: "计算机类",
    projectType: "预推免",
    deadline: "2026-05-20",
    url: "http://pc.baoyanwang.com.cn/articles/demo-tsinghua",
    summary: "面向 2026 年应届本科毕业生开放预推免报名，招收学术学位与专业学位硕士研究生。",
    structured: true,
    source: "保研网缓存"
  },
  {
    id: "news-sjtu-2026",
    title: "上海交通大学计算机学院关于举办 2026 年优秀大学生暑期夏令营的通知",
    publishedAt: "2026-05-03T16:20:00.000Z",
    university: "上海交通大学",
    school: "计算机学院",
    discipline: "计算机类",
    projectType: "夏令营",
    deadline: "2026-06-05",
    url: "http://pc.baoyanwang.com.cn/articles/demo-sjtu",
    summary: "夏令营拟于 7 月举办，活动包括学术讲座、实验室参观、面试考核，需提交个人陈述、成绩单、英语证明等材料。",
    structured: true,
    source: "保研网缓存"
  },
  {
    id: "news-zju-2026",
    title: "浙江大学计算机学院 2026 年优秀大学生云夏令营报名延期通知",
    publishedAt: "2026-05-03T11:05:00.000Z",
    university: "浙江大学",
    school: "计算机学院",
    discipline: "人工智能",
    projectType: "夏令营",
    deadline: "2026-05-15",
    url: "http://pc.baoyanwang.com.cn/articles/demo-zju",
    summary: "原定报名截止时间延长至 5 月 15 日，已报名同学无需重复操作。",
    structured: false,
    source: "保研网缓存"
  }
];

export const cachedTechHotspots = [
  {
    id: "tech-qbit-001",
    source: "量子位",
    title: "“DeepSeek版Claude Code”，Github 2.3k星",
    publishedAt: "2026-05-04T06:09:16.000Z",
    topic: "AI Agent",
    url: "https://www.qbitai.com/2026/05/412914.html",
    summary: "专门针对 DeepSeek 优化，可作为 AI 编程与智能体工具链方向的热点素材。",
    tags: ["AI Agent", "DeepSeek", "代码智能"],
    cached: true
  },
  {
    id: "tech-jiqizhixin-001",
    source: "机器之心",
    title: "机器之心网页端 2026 年文章入口",
    publishedAt: "2026-05-04T00:00:00.000Z",
    topic: "AI 热点",
    url: "https://www.jiqizhixin.com/articles/2026-05-04-4",
    summary: "机器之心公开网页端入口，用于抓取 2026 年文章；若站点返回数据服务页，则刷新时保留缓存。",
    tags: ["机器之心", "网页资讯", "AI 热点"],
    cached: true
  },
  {
    id: "tech-qbit-002",
    source: "量子位",
    title: "突破视觉仿真算力瓶颈！新一代具身智能仿真框架开源",
    publishedAt: "2026-05-03T03:56:44.000Z",
    topic: "具身智能",
    url: "https://www.qbitai.com/2026/05/412870.html",
    summary: "关注高吞吐并行高保真渲染和规模化训练，对具身智能、机器人仿真方向有参考价值。",
    tags: ["具身智能", "仿真", "开源框架"],
    cached: true
  }
];
