const NEWS_SOURCE_URL = "http://pc.baoyanwang.com.cn/articles?category=%E4%BF%9D%E7%A0%94%E4%BF%A1%E6%81%AF";

const navItems = [
  ["news", "保研资讯", "News"],
  ["tech", "科技热点", "Tech"],
  ["package", "材料打包", "Package"],
  ["profile", "个人档案与进度", "Profile"]
];

const materialNames = [
  "本科成绩单",
  "专业排名证明",
  "英语水平证明",
  "身份证复印件",
  "学生证复印件",
  "专家推荐信",
  "推免申请表",
  "个人陈述",
  "研究计划书",
  "个人简历",
  "诚信承诺书",
  "获奖证书",
  "科研成果材料"
];

const sampleNotice = `南京大学计算机科学与技术系 2026 年推荐免试研究生综合考核办法

一、申请条件
申请人须为 2026 年应届本科毕业生，专业排名位于前 25%。英语水平良好，CET-6 达到 425 分及以上。

二、申请材料
1. 推免申请表，须本人签字。
2. 本科成绩单原件扫描件，须加盖教务处章。
3. 专业排名证明原件扫描件，须加盖院章。
4. 英语水平证明复印件。
5. 专家推荐信 2 封，推荐人亲签。
6. 个人简历，不超过 2 页。
7. 获奖证书、论文或专利材料，如有可提交。

三、时间安排
报名时间：2026 年 5 月 8 日至 2026 年 5 月 25 日。
面试时间：2026 年 5 月 30 日。
拟录取结果公示：2026 年 6 月 5 日。`;

let state = null;
let currentPage = "news";
let selectedApplicationId = null;
let selectedNewsId = null;
let newsFilter = "全部";
let techFilter = "全部";
let appConfig = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

init();

async function init() {
  renderNav();
  bindShell();
  await loadState();
  switchPage("news");
}

function bindShell() {
  $("#clearExportsBtn").addEventListener("click", async () => {
    await api("/api/privacy/clear-exports", { method: "POST" });
    await loadState();
    toast("已清除导出缓存");
    renderCurrentPage();
  });
}

async function loadState() {
  state = await api("/api/state");
  appConfig = state.config || appConfig;
  selectedApplicationId ||= state.applications[0]?.id || null;
  selectedNewsId ||= state.news.items[0]?.id || null;
  $("#profilePill").textContent = `${state.profile.name} · ${state.profile.major}`;
}

function renderNav() {
  $("#nav").innerHTML = navItems.map(([id, label], index) => `
    <button class="nav-button ${id === currentPage ? "active" : ""}" data-page="${id}">
      <span class="nav-num">${String(index + 1).padStart(2, "0")}</span>
      <span class="nav-label">${label}</span>
    </button>
  `).join("");

  $$("#nav .nav-button").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });
}

function switchPage(page) {
  currentPage = page;
  renderNav();
  $$(".page").forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
  const item = navItems.find(([id]) => id === page);
  $("#breadcrumb").textContent = `Yan / ${item?.[2] || ""}`;
  $("#pageTitle").textContent = item?.[1] || "砚";
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrentPage() {
  if (!state) return;
  ({
    news: renderNews,
    tech: renderTech,
    package: renderPackage,
    profile: renderProfile
  })[currentPage]?.();
}

function renderNews() {
  const filters = ["全部", "夏令营", "预推免", "直推", "开放中", "已结构化"];
  const items = filterNews(state.news.items);
  const selected = state.news.items.find((item) => item.id === selectedNewsId) || state.news.items[0];

  $("#page-news").innerHTML = `
    <div class="toolbar">
      <div>
        <div class="source-line">Source · <a href="${NEWS_SOURCE_URL}" target="_blank" rel="noreferrer">保研信息网</a></div>
        <div class="muted small">${state.news.stale ? "缓存" : "实时"} · ${formatDateTime(state.news.updatedAt)}</div>
      </div>
      <button class="secondary-button" id="refreshNewsBtn">抓取更新</button>
    </div>
    <div class="filter-row">${filters.map((filter) => chip(filter, newsFilter)).join("")}</div>
    <div class="news-layout">
      <section class="news-list">${items.map(renderNewsCard).join("") || empty("暂无结果")}</section>
      <aside class="panel detail-panel">${selected ? renderNewsDetail(selected) : empty("暂无详情")}</aside>
    </div>
  `;

  $("#refreshNewsBtn").addEventListener("click", async () => {
    const result = await api("/api/news/refresh", { method: "POST" });
    await loadState();
    toast(result.message);
    renderNews();
  });
  bindFilter("[data-filter]", (value) => {
    newsFilter = value;
    renderNews();
  });
  $$(".news-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedNewsId = card.dataset.newsId;
      renderNews();
    });
  });
  $("#importNewsBtn")?.addEventListener("click", async () => {
    await api("/api/import-news", { method: "POST", body: JSON.stringify({ newsId: selected.id }) });
    await loadState();
    toast("已导入");
    switchPage("package");
  });
}

function renderNewsCard(item) {
  return `
    <article class="card news-card" data-news-id="${item.id}">
      <div class="news-meta"><span>${escapeHtml(item.university)}</span><span>${formatDate(item.publishedAt || item.registrationStart || item.activityStart)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="muted small">${escapeHtml(item.summary)}</p>
      <div class="row-actions compact">
        <span class="badge ${item.structured ? "ready" : "warn"}">${item.structured ? "已结构化" : "仅原文"}</span>
        <span class="badge warn">${escapeHtml(item.projectType)}</span>
        <span class="muted small">${item.deadline ? `截止 ${formatDate(item.deadline)}` : "待确认"}</span>
      </div>
    </article>
  `;
}

function renderNewsDetail(item) {
  return `
    <div class="section-head flush"><h2>${escapeHtml(item.university)}</h2><span class="badge ${item.structured ? "ready" : "warn"}">${item.structured ? "已结构化" : "仅原文"}</span></div>
    <h3>${escapeHtml(item.title)}</h3>
    <p class="muted">${escapeHtml(item.summary)}</p>
    <div class="mini-list">
      ${mini("学院", item.school)}
      ${mini("项目", item.projectType)}
      ${mini("报名", item.registrationStart && item.registrationEnd ? `${item.registrationStart} ~ ${item.registrationEnd}` : "需确认")}
      ${mini("活动", item.activityStart && item.activityEnd ? `${item.activityStart} ~ ${item.activityEnd}` : "需确认")}
      ${mini("截止", item.deadline || "需确认")}
    </div>
    <div class="row-actions">
      <a class="secondary-button" href="${item.url}" target="_blank" rel="noreferrer">原文</a>
      ${item.officeUrl ? `<a class="ghost-button" href="${item.officeUrl}" target="_blank" rel="noreferrer">官网/公众号</a>` : ""}
      <button class="primary-button" id="importNewsBtn">导入</button>
    </div>
  `;
}

function renderTech() {
  const filters = ["全部", "量子位", "机器之心", "AI Agent", "模型部署", "具身智能", "大模型"];
  const items = state.techHotspots.items.filter((item) => techFilter === "全部" || item.source === techFilter || item.topic === techFilter);

  $("#page-tech").innerHTML = `
    <div class="toolbar">
      <div>
        <div class="source-line">量子位 · 机器之心 · 网页端资讯</div>
        <div class="muted small">${state.techHotspots.stale ? "缓存" : "实时"} · ${formatDateTime(state.techHotspots.updatedAt)}</div>
      </div>
      <button class="secondary-button" id="refreshTechBtn">抓取更新</button>
    </div>
    <div class="filter-row">${filters.map((filter) => chip(filter, techFilter, "tech-filter")).join("")}</div>
    <div class="grid airy">
      ${items.map((item) => `
        <article class="card">
          <div class="news-meta"><span>${escapeHtml(item.source)}</span><span>${formatDate(item.publishedAt)}</span></div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted small">${escapeHtml(item.summary)}</p>
          <div>${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          <div class="row-actions compact">
            <a class="ghost-button" href="${item.url}" target="_blank" rel="noreferrer">原文</a>
          </div>
        </article>
      `).join("")}
    </div>
  `;

  $("#refreshTechBtn").addEventListener("click", async () => {
    const result = await api("/api/tech/refresh", { method: "POST" });
    await loadState();
    toast(result.message);
    renderTech();
  });
  bindFilter("[data-tech-filter]", (value) => {
    techFilter = value;
    renderTech();
  });
}

function renderPackage() {
  const app = getSelectedApplication();
  if (!app) {
    $("#page-package").innerHTML = empty("暂无申请");
    return;
  }
  const match = app.match;
  const university = valueOr(app.basicInfo.university, "院校待确认");
  const apiKeyConfigured = Boolean(appConfig?.ai?.apiKeyConfigured);
  const aiModel = appConfig?.ai?.model || "gpt-4.1";
  const aiBaseUrl = appConfig?.ai?.baseUrl || "https://api.openai.com/v1";

  $("#page-package").innerHTML = `
    <div class="package-workspace">
      <section class="workbench-head">
        <div>
          <h2>申请材料工作台</h2>
          <p>粘贴通知后解析要求，逐项上传对应文件，最后导出完整申请包。</p>
        </div>
        <div class="application-switcher">
          <label>当前申请</label>
          <select id="applicationSelect">
            ${state.applications.map((item) => `<option value="${item.id}" ${item.id === app.id ? "selected" : ""}>${escapeHtml(applicationLabel(item))}</option>`).join("")}
          </select>
        </div>
      </section>

      <div class="workflow-strip">
        ${workflowStep("1", "解析要求", "从通知里抽取院校、时间和材料清单。", app.materials.length ? "done" : "active")}
        ${workflowStep("2", "逐项上传", `已就绪 ${match.ready}/${match.total} 项材料。`, match.ready === match.total && match.total ? "done" : "active")}
        ${workflowStep("3", "打包导出", "生成 PDF 目录或 ZIP 原文件包。", match.state === "可导出" ? "done" : "")}
      </div>

      <div class="package-grid">
        <main class="package-main">
          <section class="panel parse-panel">
            <div class="section-head flush">
              <div>
                <h2>1. 解析通知</h2>
                <p>${escapeHtml(app.original.fileName)} · ${apiKeyConfigured ? `使用 ${escapeHtml(aiModel)}` : "未配置大模型 Key，使用本地规则"}</p>
              </div>
              <span class="badge ${apiKeyConfigured ? "ready" : "warn"}">${apiKeyConfigured ? "AI 已配置" : "本地规则"}</span>
            </div>
            ${renderAiParseStatus(app)}
            <div class="notice-input-grid">
              <div class="field">
                <label>通知原文</label>
                <textarea id="noticeText" placeholder="粘贴院校通知原文">${escapeHtml(app.original?.text || "")}</textarea>
              </div>
              <div class="parse-side">
                <div class="field">
                  <label>导入文件</label>
                  <input id="noticeFile" type="file" accept=".txt,.md,.html,.pdf,.doc,.docx" />
                </div>
                <div class="config-note">
                  <strong>${escapeHtml(appConfig?.ai?.provider || "openai-compatible")}</strong>
                  <span>${escapeHtml(aiBaseUrl)}</span>
                </div>
                <button class="primary-button full" id="parseBtn">重新解析通知</button>
                <button class="ghost-button full" id="sampleBtn">填入示例</button>
              </div>
            </div>
          </section>

          <section class="panel material-board">
            <div class="section-head flush">
              <div>
                <h2>2. 按要求准备文件</h2>
                <p>每一行就是一个提交要求。直接在这一行上传文件，或从档案柜选择已上传文件。</p>
              </div>
              <span class="badge ${match.state === "可导出" ? "ready" : "warn"}">${match.state}</span>
            </div>
            ${renderMaterialList(app.materials, match.items)}
          </section>

          <section class="panel source-viewer" id="sourceViewer">
            <div class="section-head flush"><h2>原文定位</h2><span class="muted small">点击材料来源编号可高亮原文</span></div>
            ${app.original.blocks.map((block) => `<div class="source-block" id="src-${block.id}"><strong>${block.id}</strong> · P${block.page}<br>${escapeHtml(block.text)}</div>`).join("")}
          </section>
        </main>

        <aside class="package-aside">
          <section class="panel export-panel">
            <div class="section-head flush">
              <h2>3. 打包导出</h2>
              <span class="badge ${match.state === "可导出" ? "ready" : "warn"}">${match.ready}/${match.total}</span>
            </div>
            <div class="export-meter"><span style="width:${match.total ? Math.round((match.ready / match.total) * 100) : 0}%"></span></div>
            <div class="cover-card">
              <div class="seal">${escapeHtml(university.slice(0, 1))}</div>
              <div>
                <strong>${escapeHtml(university)}推免申请材料</strong>
                <div class="muted small">${escapeHtml(state.profile.name)} · ${escapeHtml(state.profile.submitDate)}</div>
              </div>
            </div>
            <div class="mini-list compact-summary">
              ${mini("院校", university)}
              ${mini("学院", valueOr(app.basicInfo.school, "需确认"))}
              ${mini("类型", programLabel(app.basicInfo.program_type.value))}
              ${mini("缺漏", `${match.missing} 缺失 / ${match.needsFix} 待修正`)}
            </div>
            <div class="export-actions">
              <button class="primary-button full" id="exportZipBtn">打包 ZIP 原文件</button>
              <button class="secondary-button full" id="exportPdfBtn">导出 PDF 清单</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;

  $("#sampleBtn").addEventListener("click", () => {
    $("#noticeText").value = sampleNotice;
  });
  $("#noticeFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $("#noticeText").value = await file.text();
  });
  $("#parseBtn").addEventListener("click", parseNotice);
  $("#applicationSelect").addEventListener("change", (event) => {
    selectedApplicationId = event.target.value;
    renderPackage();
  });
  $("#exportPdfBtn").addEventListener("click", () => exportApplication("pdf"));
  $("#exportZipBtn").addEventListener("click", () => exportApplication("zip"));
  bindMaterialUploadActions(app);
  bindCitationClicks();
}

function renderAiParseStatus(app) {
  const ai = app.ai || {};
  const used = ai.mode === "api_used";
  return `
    <div class="parse-status ${used ? "ready" : "warn"}">
      <strong>${used ? "大模型已参与解析" : "本地规则解析"}</strong>
      <span>${escapeHtml(ai.note || "未读取到 AI 解析状态")}</span>
    </div>
  `;
}

function workflowStep(num, title, detail, state = "") {
  return `
    <div class="workflow-step ${state}">
      <span class="step-num">${num}</span>
      <strong>${title}</strong>
      <span>${detail}</span>
    </div>
  `;
}

function renderBasicInfo(app) {
  return `
    <div class="section-head flush"><h2>信息</h2></div>
    <div class="mini-list">
      ${fieldMini("院校", app.basicInfo.university)}
      ${fieldMini("学院", app.basicInfo.school)}
      ${mini("类型", programLabel(app.basicInfo.program_type.value))}
      ${mini("方向", app.basicInfo.directions.value.join("、") || "需确认")}
    </div>
    <div class="timeline-strip">
      ${app.timeline.map((event) => `<button class="time-pill" data-cite="${event.source_blocks[0]}">${timelineLabel(event.event_type)} · ${event.date_iso || "待确认"}</button>`).join("")}
    </div>
  `;
}

function renderMaterialList(materials, matches = []) {
  const matchByOrdinal = new Map(matches.map((item) => [item.requirement.ordinal, item]));
  if (!materials.length) {
    return `
      <div class="empty">这份通知暂未识别出材料清单。请把通知中“申请材料/提交材料”段落补充完整后重新解析。</div>
    `;
  }
  return `
    <div class="material-list">
      ${materials.map((item) => {
        const match = matchByOrdinal.get(item.ordinal);
        const stateClass = match?.state === "ready" ? "ready" : match?.state === "missing" ? "missing" : "warn";
        return `
          <article class="material-item ${stateClass}">
            <div class="material-index">${String(item.ordinal).padStart(2, "0")}</div>
            <div class="material-copy">
              <div class="material-title-row">
                <h3>${escapeHtml(item.name_normalized || item.name_original || "需确认")}</h3>
                <span class="badge ${stateClass}">${match?.emoji || "·"} ${match?.label || "待匹配"}</span>
              </div>
              <p>${escapeHtml(item.raw_text)}</p>
              <div class="material-tags">${requirementTags(item)} ${item.source_blocks.map(cite).join("")}</div>
            </div>
            <div class="material-file">
              ${renderMatchedDocs(match?.documents || [])}
              <div class="material-actions">
                <label class="primary-button file-button">
                  上传此材料
                  <input type="file" data-upload-material="${item.ordinal}" hidden />
                </label>
                <div class="existing-doc-picker">
                  <select data-doc-select="${item.ordinal}">
                    <option value="">选择已上传文件</option>
                    ${documentOptions(match?.documents || [])}
                  </select>
                </div>
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderMatchedDocs(docs = []) {
  if (!docs.length) return `<div class="matched-docs muted small">还没有文件。请上传此材料，或选择一个已有文件。</div>`;
  return `
    <div class="matched-docs">
      ${docs.map((doc) => `<span class="tag">${escapeHtml(doc.fileName || doc.name)}</span>`).join("")}
    </div>
  `;
}

function documentOptions(selectedDocs = []) {
  const selectedIds = new Set(selectedDocs.map((doc) => doc.id));
  return state.documents.map((doc) => `
    <option value="${doc.id}" ${selectedIds.has(doc.id) ? "selected" : ""}>
      ${escapeHtml(doc.name)} · ${escapeHtml(doc.fileName || "未命名文件")}
    </option>
  `).join("");
}

function bindMaterialUploadActions(app) {
  $$("[data-doc-select]").forEach((select) => {
    select.addEventListener("change", async () => {
      const ordinal = select.dataset.docSelect;
      const documentId = select.value;
      if (!documentId) return;
      select.disabled = true;
      await api("/api/documents/link", {
        method: "POST",
        body: JSON.stringify({
          documentId,
          applicationId: app.id,
          materialOrdinal: ordinal
        })
      });
      await loadState();
      toast("已使用这个文件");
      renderPackage();
      select.disabled = false;
    });
  });

  $$("[data-upload-material]").forEach((input) => {
    input.addEventListener("change", async () => {
      const ordinal = input.dataset.uploadMaterial;
      const requirement = app.materials.find((item) => String(item.ordinal) === String(ordinal));
      const file = input.files?.[0];
      if (!file || !requirement) return;
      await uploadFileAsDocument(file, {
        applicationId: app.id,
        materialOrdinal: ordinal,
        persist: false,
        name: requirement.name_original || requirement.name_normalized || file.name,
        normalizedName: requirement.name_normalized || requirement.name_original || file.name,
        form: requirement.form || "electronic",
        pageCount: requirement.page_limit || 1,
        detectedSeals: requirement.seal_required || [],
        scope: "application",
        schoolKey: valueOr(app.basicInfo.university, "")
      });
      await loadState();
      toast("已上传到这条材料要求");
      renderPackage();
    });
  });
}

async function uploadFileAsDocument(file, meta) {
  const contentBase64 = await fileToBase64(file);
  return api("/api/documents", {
    method: "POST",
    body: JSON.stringify({
      ...meta,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      contentBase64
    })
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderProfile() {
  const apps = state.applications;
  const totals = apps.reduce((acc, app) => {
    acc.ready += app.match.ready;
    acc.total += app.match.total;
    acc.missing += app.match.missing;
    return acc;
  }, { ready: 0, total: 0, missing: 0 });

  $("#page-profile").innerHTML = `
    <div class="stats-row">
      ${stat("申请", apps.length)}
      ${stat("就绪", `${totals.ready}/${totals.total}`)}
      ${stat("缺失", totals.missing)}
    </div>
    <div class="profile-layout">
      <section>
        <div class="section-head"><h2>进度</h2></div>
        <div class="grid">${apps.map(renderProgressCard).join("")}</div>
        <div class="section-head"><h2>档案</h2></div>
        <div class="grid airy">${state.documents.map(renderDocumentCard).join("")}</div>
      </section>
      <aside class="panel">
        <div class="section-head flush"><h2>新增材料</h2></div>
        <form id="docForm" class="form-grid">
          <div class="field full"><label>名称</label><input name="name" required placeholder="推荐信 · 李教授" /></div>
          <div class="field"><label>标准名</label><select name="normalizedName">${materialNames.map((name) => `<option>${name}</option>`).join("")}</select></div>
          <div class="field"><label>形式</label><select name="form"><option value="electronic">电子版</option><option value="original_scan">原件扫描</option><option value="copy">复印件</option></select></div>
          <div class="field"><label>页数</label><input name="pageCount" type="number" min="1" value="1" /></div>
          <div class="field"><label>份数</label><input name="copyCount" type="number" min="1" value="1" /></div>
          <div class="field full"><label>章/签字</label><input name="detectedSeals" placeholder="教务处章、本人签字" /></div>
          <div class="field full"><label>文件</label><input id="profileDocFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /></div>
          <button class="primary-button full">保存</button>
        </form>
        <div class="section-head flush logo-upload-head"><h2>校徽库</h2></div>
        <form id="logoForm" class="form-grid logo-form">
          <div class="field full"><label>院校名称</label><input name="university" required placeholder="浙江大学" value="${escapeHtml(valueOr(getSelectedApplication()?.basicInfo?.university, ""))}" /></div>
          <div class="field full"><label>校徽图片</label><input id="logoFile" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" required /></div>
          <button class="secondary-button full">上传校徽</button>
        </form>
      </aside>
    </div>
  `;

  $("#docForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const file = $("#profileDocFile").files?.[0];
    if (file) {
      payload.fileName = file.name;
      payload.mimeType = file.type;
      payload.fileSize = file.size;
      payload.contentBase64 = await fileToBase64(file);
    }
    await api("/api/documents", { method: "POST", body: JSON.stringify(payload) });
    await loadState();
    toast(file ? "已保存并上传文件" : "已保存材料信息");
    renderProfile();
  });
  $("#logoForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    const file = $("#logoFile").files?.[0];
    if (!file) return toast("请选择校徽图片");
    await api("/api/logos", {
      method: "POST",
      body: JSON.stringify({
        university: payload.university,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        contentBase64: await fileToBase64(file)
      })
    });
    toast("校徽已上传到 src/images");
    event.currentTarget.reset();
  });
  $$(".progress-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedApplicationId = card.dataset.id;
      switchPage("package");
    });
  });
  $$("[data-delete-application]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await api("/api/applications", {
        method: "DELETE",
        body: JSON.stringify({ applicationId: button.dataset.deleteApplication })
      });
      if (selectedApplicationId === button.dataset.deleteApplication) selectedApplicationId = null;
      await loadState();
      selectedApplicationId ||= state.applications[0]?.id || null;
      toast("已删除申请记录");
      renderProfile();
    });
  });
  $$("[data-upload-profile-doc]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      await api("/api/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          documentId: input.dataset.uploadProfileDoc,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          contentBase64: await fileToBase64(file)
        })
      });
      await loadState();
      toast("档案文件已更新");
      renderProfile();
    });
  });
  $("#page-profile").onclick = handleProfileActions;
}

function renderProgressCard(app) {
  const university = valueOr(app.basicInfo.university, "院校待确认");
  const school = displaySchool(app);
  const type = programLabel(app.basicInfo.program_type.value);
  const deadline = (app.timeline || []).find((event) => event.event_type === "registration_close") || app.timeline?.[0];
  return `
    <article class="card progress-card" data-id="${app.id}">
      <button type="button" class="card-delete" data-delete-application="${app.id}" title="删除申请" aria-label="删除申请">×</button>
      <div class="school-head">
        <div class="emblem">${escapeHtml(university.slice(0, 1))}</div>
        <div>
          <div class="school-title">${escapeHtml(university)}</div>
          <div class="muted small">${escapeHtml([school, type !== "需确认" ? type : ""].filter(Boolean).join(" · ") || applicationFallbackTitle(app))}</div>
          <div class="muted small">${deadline?.date_iso ? formatDate(deadline.date_iso) : "时间待确认"}</div>
        </div>
      </div>
      <div class="progress"><span style="width:${app.match.percent}%"></span></div>
      <span class="badge ${app.match.state === "可导出" ? "ready" : "warn"}">${app.match.state}</span>
    </article>
  `;
}

function applicationLabel(app) {
  const university = valueOr(app.basicInfo.university, "院校待确认");
  const school = displaySchool(app);
  const type = programLabel(app.basicInfo.program_type.value);
  return [university, school, type !== "需确认" ? type : applicationFallbackTitle(app)].filter(Boolean).join(" · ");
}

function displaySchool(app) {
  const school = valueOr(app.basicInfo.school, "");
  if (!school || /须|加盖|公章|红章|复印|扫描|证明|成绩|排名|特举办/.test(school)) return applicationFallbackTitle(app);
  return school;
}

function applicationFallbackTitle(app) {
  return String(app.original?.fileName || app.original?.blocks?.[0]?.text || "项目待确认")
    .replace(/\.(txt|md|html|pdf|docx?)$/i, "")
    .slice(0, 18);
}

function renderDocumentCard(doc) {
  return `
    <article class="card doc-card">
      <button type="button" class="card-delete doc-delete" data-delete-document="${doc.id}" title="删除材料" aria-label="删除材料">×</button>
      <div class="doc-top"><div class="doc-icon"></div><span class="badge ready">${doc.scope === "global" ? "通用" : "专属"}</span></div>
      <h3>${escapeHtml(doc.name)}</h3>
      <div class="muted small">${escapeHtml(doc.normalizedName)} · ${formLabel(doc.form)} · ${doc.pageCount} 页</div>
      <div class="muted small">${escapeHtml(doc.fileName || "未上传文件")}</div>
      <div>${(doc.detectedSeals || []).map((seal) => `<span class="tag red">${escapeHtml(seal)}</span>`).join("") || `<span class="tag gold">${escapeHtml(doc.statusNote || "未检测")}</span>`}</div>
      <label class="secondary-button doc-upload-button">
        ${doc.storedFileName ? "替换文件" : "上传文件"}
        <input type="file" data-upload-profile-doc="${doc.id}" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" hidden />
      </label>
    </article>
  `;
}

async function handleProfileActions(event) {
  const deleteButton = event.target.closest("[data-delete-document]");
  if (!deleteButton) return;
  event.preventDefault();
  event.stopPropagation();
  await api("/api/documents/delete", {
    method: "POST",
    body: JSON.stringify({ documentId: deleteButton.dataset.deleteDocument })
  });
  await loadState();
  toast("已删除档案材料");
  renderProfile();
}

async function parseNotice() {
  const text = $("#noticeText").value.trim();
  if (!text) return toast("请粘贴通知");
  const model = appConfig?.ai?.model || $("#modelInput")?.value.trim() || "";

  const result = await api("/api/notice/parse", {
    method: "POST",
    body: JSON.stringify({
      text,
      fileName: $("#noticeFile").files?.[0]?.name || "通知原文.txt",
      ai: { provider: appConfig?.ai?.provider || "openai-compatible", model, apiKeyConfigured: Boolean(appConfig?.ai?.apiKeyConfigured) }
    })
  });
  selectedApplicationId = result.application.id;
  await loadState();
  toast("解析完成");
  renderPackage();
}

async function exportApplication(type) {
  const record = await api("/api/export", {
    method: "POST",
    body: JSON.stringify({ applicationId: selectedApplicationId, type })
  });
  await loadState();
  toast(`${type.toUpperCase()} 已生成`);
  window.open(record.downloadUrl, "_blank");
}

function requirementTags(item) {
  const tags = [];
  if (item.is_required) tags.push(`<span class="tag">${requiredLabel(item.is_required)}</span>`);
  if (item.form) tags.push(`<span class="tag">${formLabel(item.form)}</span>`);
  if (item.seal_required) item.seal_required.forEach((seal) => tags.push(`<span class="tag red">${escapeHtml(seal)}</span>`));
  if (item.quantity) tags.push(`<span class="tag">${item.quantity} 份</span>`);
  if (item.page_limit) tags.push(`<span class="tag gold">≤ ${item.page_limit} 页</span>`);
  if (item._uncertain) tags.push(`<span class="tag red">需确认</span>`);
  return tags.join("");
}

function filterNews(items) {
  return items.filter((item) => {
    if (newsFilter === "全部") return true;
    if (newsFilter === "开放中") return item.deadline && new Date(item.deadline) >= new Date("2026-05-05");
    if (newsFilter === "已结构化") return item.structured;
    return item.projectType === newsFilter;
  });
}

function bindFilter(selector, onChange) {
  $$(selector).forEach((button) => {
    button.addEventListener("click", () => onChange(button.dataset.filter || button.dataset.techFilter));
  });
}

function bindCitationClicks() {
  $$("[data-cite]").forEach((button) => {
    button.addEventListener("click", () => highlightBlock(button.dataset.cite));
  });
}

function highlightBlock(blockId) {
  $$(".source-block").forEach((block) => block.classList.toggle("active", block.id === `src-${blockId}`));
  $(`#src-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function getSelectedApplication() {
  return state.applications.find((app) => app.id === selectedApplicationId) || state.applications[0];
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

function chip(label, active, dataName = "filter") {
  return `<button class="chip ${active === label ? "active" : ""}" data-${dataName}="${label}">${label}</button>`;
}

function cite(blockId) {
  return `<button class="cite" data-cite="${blockId}">${blockId}</button>`;
}

function mini(label, value) {
  return `<div class="mini"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function fieldMini(label, field) {
  return `<div class="mini"><span>${label}</span><strong>${escapeHtml(valueOr(field, "需确认"))}</strong>${(field.source || []).map(cite).join("")}</div>`;
}

function stat(label, value) {
  return `<div class="stat compact-stat"><div class="label">${label}</div><div class="num">${value}</div></div>`;
}

function empty(text) {
  return `<div class="panel empty">${text}</div>`;
}

function valueOr(field, fallback) {
  if (field && typeof field === "object" && "value" in field) return field.value || fallback;
  return field || fallback;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function formatDate(value) {
  if (!value) return "待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, "0")}·${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function programLabel(value) {
  return {
    summer_camp: "夏令营",
    pre_recommendation: "预推免",
    direct_admission: "直推/直博"
  }[value] || "需确认";
}

function requiredLabel(value) {
  return {
    must: "必须",
    optional: "可选",
    conditional: "条件必交"
  }[value] || "需确认";
}

function formLabel(value) {
  return {
    original_scan: "原件扫描",
    copy: "复印件",
    electronic: "电子版"
  }[value] || "需确认";
}

function timelineLabel(value) {
  return {
    registration_open: "报名开始",
    registration_close: "报名截止",
    review_announce: "初审",
    interview: "面试",
    result_announce: "公示",
    _other: "时间"
  }[value] || "时间";
}
