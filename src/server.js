import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportApplication } from "./services/exporter.js";
import { matchMaterials } from "./services/matcher.js";
import { mergeAiNoticeParse, parseNotice } from "./services/parser.js";
import { parseNoticeWithAi } from "./services/ai-parser.js";
import { fetchBaoyanNews, fetchTechHotspots } from "./services/crawler.js";
import { loadAppConfig, publicConfig } from "./services/config.js";
import { loadState, publicState, saveState } from "./services/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const EXPORT_DIR = path.join(ROOT, "exports");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const IMAGE_DIR = path.join(ROOT, "src", "images");
const PORT = Number(process.env.PORT || 5178);

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    if (req.url.startsWith("/downloads/")) return await handleDownload(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用。请先关闭已有服务，或使用其他端口启动：`);
    console.error(`PowerShell: $env:PORT=5180; npm run dev`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`砚已启动：http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const state = await loadState();
  const appConfig = await loadAppConfig();
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, {
      ...publicState({ ...state, profile: effectiveProfile(state.profile, appConfig.profile) }, matchMaterials),
      config: publicConfig(appConfig)
    });
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    return sendJson(res, 200, publicConfig(appConfig));
  }

  if (req.method === "POST" && url.pathname === "/api/profile") {
    const body = await readJson(req);
    state.profile = { ...state.profile, ...body };
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/notice/parse") {
    const body = await readJson(req);
    const aiConfigured = Boolean(appConfig.ai.apiKey?.trim());
    let application = parseNotice(body.text || "", {
      fileName: body.fileName || "院校通知.txt",
      year: 2026
    });
    let aiError = "";
    let aiErrorDetail = null;
    if (aiConfigured) {
      try {
        const aiParsed = await parseNoticeWithAi({
          text: body.text || "",
          config: appConfig,
          ruleResult: application
        });
        if (aiParsed) application = mergeAiNoticeParse(application, aiParsed);
      } catch (error) {
        aiError = error.message || "AI 解析失败";
        aiErrorDetail = {
          message: aiError,
          name: error.name || "Error"
        };
      }
    }
    application.ai = {
      mode: aiConfigured && !aiError ? "api_used" : "local_rules",
      provider: appConfig.ai.provider,
      baseUrl: appConfig.ai.baseUrl,
      model: appConfig.ai.model || body.ai?.model || "",
      apiKeyStored: aiConfigured,
      error: aiErrorDetail,
      note: aiConfigured && !aiError
        ? "已调用 config/app.local.json 中配置的大模型，并保留本地规则兜底。"
        : aiError
          ? `大模型解析失败，已使用本地规则兜底：${aiError}`
          : "未配置 API Key，使用本地可追溯规则解析。"
    };
    state.applications = state.applications.filter((item) => applicationKey(item) !== applicationKey(application));
    state.applications.unshift(application);
    await saveState(state);
    return sendJson(res, 200, {
      application,
      match: matchMaterials(application, state.documents)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/documents") {
    const body = await readJson(req);
    const document = {
      id: `doc-${Date.now().toString(36)}`,
      scope: body.persist === false ? "application" : body.scope || "global",
      schoolKey: body.schoolKey || "",
      name: body.name || body.normalizedName || "未命名材料",
      normalizedName: body.normalizedName || body.name || "需人工确认",
      fileName: body.fileName || `${body.name || "材料"}.pdf`,
      originalFileName: body.fileName || "",
      storedFileName: "",
      mimeType: body.mimeType || "",
      fileSize: Number(body.fileSize || 0),
      form: body.form || "electronic",
      pageCount: Number(body.pageCount || 1),
      wordCount: Number(body.wordCount || 0),
      copyCount: Number(body.copyCount || 1),
      detectedSeals: Array.isArray(body.detectedSeals) ? body.detectedSeals : splitList(body.detectedSeals),
      statusNote: body.statusNote || (body.persist === false ? "当前申请上传" : "用户上传"),
      updatedAt: new Date().toISOString()
    };
    if (body.contentBase64) {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      const storedFileName = `${Date.now()}_${safeFileName(document.fileName)}`;
      await fs.writeFile(path.join(UPLOAD_DIR, storedFileName), Buffer.from(body.contentBase64, "base64"));
      document.storedFileName = storedFileName;
      document.fileSize = document.fileSize || Buffer.byteLength(body.contentBase64, "base64");
    }
    if (body.persist === false) {
      const application = state.applications.find((item) => item.id === body.applicationId);
      const requirement = application?.materials?.find((item) => String(item.ordinal) === String(body.materialOrdinal));
      if (!application || !requirement) return sendJson(res, 404, { error: "未找到当前申请或材料要求" });
      application.documents ||= [];
      application.documents.unshift(document);
      application.materialLinks ||= {};
      application.materialLinks[String(requirement.ordinal)] = document.id;
      await saveState(state);
      return sendJson(res, 200, publicState(state, matchMaterials));
    }
    state.documents.unshift(document);
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/documents/link") {
    const body = await readJson(req);
    const document = state.documents.find((item) => item.id === body.documentId);
    const application = state.applications.find((item) => item.id === body.applicationId);
    const requirement = application?.materials?.find((item) => String(item.ordinal) === String(body.materialOrdinal));
    if (!document || !requirement) return sendJson(res, 404, { error: "未找到材料或申请要求" });
    application.materialLinks ||= {};
    application.materialLinks[String(requirement.ordinal)] = document.id;
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/documents/upload") {
    const body = await readJson(req);
    const document = state.documents.find((item) => item.id === body.documentId);
    if (!document) return sendJson(res, 404, { error: "未找到档案材料" });
    if (!body.contentBase64) return sendJson(res, 400, { error: "请选择要上传的文件" });
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const fileName = body.fileName || document.fileName || `${document.name || "材料"}.pdf`;
    const storedFileName = `${Date.now()}_${safeFileName(fileName)}`;
    await fs.writeFile(path.join(UPLOAD_DIR, storedFileName), Buffer.from(body.contentBase64, "base64"));
    document.fileName = fileName;
    document.originalFileName = fileName;
    document.storedFileName = storedFileName;
    document.mimeType = body.mimeType || document.mimeType || "";
    document.fileSize = Number(body.fileSize || Buffer.byteLength(body.contentBase64, "base64"));
    document.statusNote = "用户上传";
    document.updatedAt = new Date().toISOString();
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "DELETE" && url.pathname === "/api/documents") {
    const body = await readJson(req);
    deleteDocumentFromState(state, body.documentId);
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/documents/delete") {
    const body = await readJson(req);
    deleteDocumentFromState(state, body.documentId);
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/logos") {
    const body = await readJson(req);
    const university = String(body.university || "").trim();
    if (!university) return sendJson(res, 400, { error: "请填写院校名称" });
    if (!body.contentBase64) return sendJson(res, 400, { error: "请选择校徽图片" });
    const ext = logoExt(body.fileName || body.mimeType || "");
    if (!ext) return sendJson(res, 400, { error: "校徽只支持 PNG/JPG/JPEG" });
    await fs.mkdir(IMAGE_DIR, { recursive: true });
    const fileName = `${safeFileName(university)}${ext}`;
    await fs.writeFile(path.join(IMAGE_DIR, fileName), Buffer.from(body.contentBase64, "base64"));
    return sendJson(res, 200, { fileName, path: `src/images/${fileName}` });
  }

  if (req.method === "DELETE" && url.pathname === "/api/applications") {
    const body = await readJson(req);
    state.applications = state.applications.filter((item) => item.id !== body.applicationId);
    state.exports = state.exports.filter((item) => item.applicationId !== body.applicationId);
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/export") {
    const body = await readJson(req);
    const application = state.applications.find((item) => item.id === body.applicationId) || state.applications[0];
    if (!application) return sendJson(res, 404, { error: "未找到申请项目" });
    const matchResult = matchMaterials(application, state.documents);
    const exported = await exportApplication({
      application,
      matchResult,
      profile: effectiveProfile(state.profile, appConfig.profile),
      type: body.type || "pdf",
      outDir: EXPORT_DIR,
      uploadDir: UPLOAD_DIR,
      exportConfig: appConfig.export
    });
    const record = {
      id: `export-${Date.now().toString(36)}`,
      applicationId: application.id,
      type: exported.type,
      fileName: exported.fileName,
      downloadUrl: `/downloads/${encodeURIComponent(exported.fileName)}`,
      createdAt: new Date().toISOString()
    };
    state.exports.unshift(record);
    await saveState(state);
    return sendJson(res, 200, record);
  }

  if (req.method === "POST" && url.pathname === "/api/news/refresh") {
    state.news = await fetchBaoyanNews({ force: true, currentCache: state.news });
    await saveState(state);
    return sendJson(res, 200, state.news);
  }

  if (req.method === "POST" && url.pathname === "/api/tech/refresh") {
    state.techHotspots = await fetchTechHotspots({ currentCache: state.techHotspots });
    await saveState(state);
    return sendJson(res, 200, state.techHotspots);
  }

  if (req.method === "POST" && url.pathname === "/api/import-news") {
    const body = await readJson(req);
    const newsItem = state.news.items.find((item) => item.id === body.newsId);
    if (!newsItem) return sendJson(res, 404, { error: "未找到资讯条目" });
    const noticeText = [
      newsItem.title,
      "",
      "基本信息",
      `${newsItem.university} ${newsItem.school} ${newsItem.projectType}`,
      "",
      "时间安排",
      newsItem.deadline ? `报名截止：${newsItem.deadline}` : "报名截止：需人工确认",
      "",
      "申请材料",
      "材料清单需以院校原文为准，当前仅导入资讯标题，需上传正式通知后解析。"
    ].join("\n");
    const application = parseNotice(noticeText, { fileName: `${newsItem.title}.txt`, year: 2026 });
    application.status = "解析中";
    state.applications = state.applications.filter((item) => applicationKey(item) !== applicationKey(application));
    state.applications.unshift(application);
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/privacy/clear-exports") {
    await fs.rm(EXPORT_DIR, { recursive: true, force: true });
    await fs.mkdir(EXPORT_DIR, { recursive: true });
    state.exports = [];
    await saveState(state);
    return sendJson(res, 200, publicState(state, matchMaterials));
  }

  if (req.method === "POST" && url.pathname === "/api/upload-placeholder") {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const body = await readJson(req);
    const fileName = `${Date.now()}_${safeFileName(body.fileName || "upload.txt")}`;
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), body.content || "", "utf8");
    return sendJson(res, 200, { fileName, stored: true });
  }

  return sendJson(res, 404, { error: "API not found" });
}

async function handleDownload(req, res) {
  const fileName = decodeURIComponent(req.url.replace("/downloads/", ""));
  const fullPath = path.resolve(EXPORT_DIR, safeFileName(fileName));
  if (!fullPath.startsWith(EXPORT_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  const data = await fs.readFile(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, {
    "content-type": ext === ".pdf" ? "application/pdf" : "application/zip",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(fullPath))}`
  });
  res.end(data);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = path.resolve(PUBLIC_DIR, `.${requestPath}`);
  if (!fullPath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  try {
    const data = await fs.readFile(fullPath);
    res.writeHead(200, { "content-type": mimeType(fullPath) });
    res.end(data);
  } catch {
    const data = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(data);
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8"
  };
  return types[ext] || "application/octet-stream";
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function safeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_");
}

function logoExt(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("png") || text.endsWith(".png")) return ".png";
  if (text.includes("jpeg") || text.includes("jpg") || text.endsWith(".jpeg") || text.endsWith(".jpg")) return ".jpg";
  return "";
}

function effectiveProfile(stateProfile, configProfile) {
  const localProfile = Object.fromEntries(
    Object.entries(configProfile || {}).filter(([, value]) => String(value || "").trim())
  );
  return { ...(stateProfile || {}), ...localProfile };
}

function applicationKey(application) {
  const university = application?.basicInfo?.university?.value || "";
  const school = application?.basicInfo?.school?.value || "";
  const fileName = application?.original?.fileName || "";
  const text = String(application?.original?.text || "").replace(/\s+/g, " ").trim();
  return `${university}|${school}|${fileName}|${text}`;
}

function deleteDocumentFromState(state, documentId) {
  state.documents = state.documents.filter((item) => item.id !== documentId);
  for (const application of state.applications || []) {
    if (!application.materialLinks) continue;
    for (const [ordinal, linkedId] of Object.entries(application.materialLinks)) {
      if (linkedId === documentId) delete application.materialLinks[ordinal];
    }
  }
}
