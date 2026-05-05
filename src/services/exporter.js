import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 58;
const CATALOG_ROWS_PER_PAGE = 23;

const FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\simsun.ttc",
  "C:\\Windows\\Fonts\\NotoSansSC-VF.ttf",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
  "/usr/share/fonts/opentype/source-han-sans/SourceHanSansSC-Regular.otf",
  "/usr/share/fonts/adobe-source-han-sans/SourceHanSansSC-Regular.otf"
];

const DEFAULT_LOGO_FILES = {
  "北京大学": "Peking_University.png",
  "复旦大学": "Fudan_University.png",
  "中国人民大学": "Renmin_University_of_China.png",
  "上海交通大学": "SJTU.png",
  "清华大学": "Tsinghua_University.png",
  "浙江大学": "ZJU.png"
};

export async function exportApplication({
  application,
  matchResult,
  profile,
  type = "pdf",
  outDir,
  uploadDir = "uploads",
  exportConfig = {}
}) {
  await fs.mkdir(outDir, { recursive: true });
  const university = application.basicInfo?.university?.value || "未知院校";
  const baseName = `${sanitize(university)}_保研材料包`;

  if (type === "zip") {
    const zipPath = path.join(outDir, `${baseName}.zip`);
    const files = await buildZipEntries(application, matchResult, profile, uploadDir);
    await fs.writeFile(zipPath, createZip(files));
    return { type: "zip", fileName: path.basename(zipPath), path: zipPath };
  }

  const pdfPath = path.join(outDir, `${baseName}.pdf`);
  const pdfBytes = await createApplicationPdf({
    application,
    matchResult,
    profile,
    uploadDir,
    exportConfig
  });
  await fs.writeFile(pdfPath, pdfBytes);
  return { type: "pdf", fileName: path.basename(pdfPath), path: pdfPath };
}

async function buildZipEntries(application, matchResult, profile, uploadDir) {
  const entries = [];
  for (const [index, item] of matchResult.items.entries()) {
    const seq = String(index + 1).padStart(2, "0");
    const materialName = item.requirement.name_normalized || item.requirement.name_original;
    const university = application.basicInfo?.university?.value || "未知院校";
    for (const [docIndex, doc] of item.documents.entries()) {
      if (!doc.storedFileName) continue;
      const ext = path.extname(doc.fileName || doc.originalFileName || "");
      const suffix = item.documents.length > 1 ? `_${docIndex + 1}` : "";
      const fileName = `${seq}_${sanitize(materialName)}_${sanitize(profile.name)}_${sanitize(university)}${suffix}${ext || ".bin"}`;
      const fullPath = resolveInside(uploadDir, doc.storedFileName);
      if (!fullPath) continue;
      try {
        entries.push({ fileName, body: await fs.readFile(fullPath) });
      } catch {
        // Missing uploaded files still get a manifest entry below.
      }
    }

    const fileName = `${seq}_${sanitize(materialName)}_${sanitize(profile.name)}_${sanitize(university)}_说明.txt`;
    const body = [
      `材料：${materialName}`,
      `状态：${item.label}`,
      `原文：${item.requirement.raw_text}`,
      `来源：${item.requirement.source_blocks.join(", ")}`,
      `匹配文件：${item.documents.map((doc) => doc.fileName).join("、") || "未匹配"}`
    ].join("\n");
    entries.push({ fileName, body });
  }
  return entries;
}

async function createApplicationPdf({ application, matchResult, profile, uploadDir, exportConfig }) {
  try {
    const university = application.basicInfo?.university?.value || "未知院校";
    const materialEntries = await loadMaterialPdfs(matchResult, uploadDir);
    const catalogPageCount = Math.max(1, Math.ceil(materialEntries.length / CATALOG_ROWS_PER_PAGE));
    let nextPage = 2 + catalogPageCount;
    for (const entry of materialEntries) {
      entry.startPage = nextPage;
      nextPage += entry.pageCount;
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await embedChineseFont(pdfDoc, exportConfig.fontPath);
    const logo = await loadLogo(pdfDoc, university, exportConfig);

    drawCoverPage(pdfDoc, { university, profile, font, logo });
    drawCatalogPages(pdfDoc, { university, profile, font, logo, materialEntries });
    await appendMaterialPages(pdfDoc, materialEntries);

    return await pdfDoc.save();
  } catch (error) {
    throw new Error(`PDF 导出失败：${error.message || error}`);
  }
}

async function loadMaterialPdfs(matchResult, uploadDir) {
  const entries = [];

  for (const [requirementIndex, item] of matchResult.items.entries()) {
    const materialName = item.requirement.name_normalized || item.requirement.name_original || `材料${requirementIndex + 1}`;
    for (const [docIndex, doc] of item.documents.entries()) {
      if (!doc.storedFileName) continue;
      if (!isPdfDocument(doc)) continue;

      const fullPath = resolveInside(uploadDir, doc.storedFileName);
      if (!fullPath) continue;

      try {
        const bytes = await fs.readFile(fullPath);
        const sourcePdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        entries.push({
          seq: entries.length + 1,
          materialName,
          fileName: doc.fileName || doc.originalFileName || `${materialName}.pdf`,
          fullPath,
          sourcePdf,
          pageCount: sourcePdf.getPageCount(),
          startPage: 0,
          requirementIndex,
          docIndex
        });
      } catch (error) {
        throw new Error(`读取材料 PDF 失败：${doc.fileName || doc.storedFileName}（${error.message || error}）`);
      }
    }
  }

  return entries.sort((a, b) => a.requirementIndex - b.requirementIndex || a.docIndex - b.docIndex);
}

async function appendMaterialPages(pdfDoc, materialEntries) {
  for (const entry of materialEntries) {
    try {
      const pageIndexes = entry.sourcePdf.getPageIndices();
      const copiedPages = await pdfDoc.copyPages(entry.sourcePdf, pageIndexes);
      copiedPages.forEach((page) => pdfDoc.addPage(page));
    } catch (error) {
      throw new Error(`合并材料失败：${entry.fileName}（${error.message || error}）`);
    }
  }
}

function drawCoverPage(pdfDoc, { university, profile, font, logo }) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const generatedAt = formatDateTime(new Date());
  const title = `${university}保研材料包`;

  if (logo) {
    const { image, width, height } = logo;
    const maxSize = 74;
    const scale = Math.min(maxSize / width, maxSize / height);
    page.drawImage(image, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - MARGIN_X - height * scale,
      width: width * scale,
      height: height * scale
    });
  }

  drawText(page, title, MARGIN_X, 650, font, 26, rgb(0.08, 0.12, 0.16));
  drawText(page, "推荐免试研究生申请材料", MARGIN_X, 610, font, 18, rgb(0.24, 0.28, 0.33));

  const infoLines = [
    `申请人：${profile.name || "未填写"}`,
    `本科院校：${profile.homeUniversity || "未填写"}`,
    `本科专业：${profile.major || "未填写"}`,
    `申请方向：${profile.targetMajor || "未填写"}`,
    `提交日期：${profile.submitDate || generatedAt.slice(0, 10)}`,
    `生成时间：${generatedAt}`
  ];
  infoLines.forEach((line, index) => drawText(page, line, MARGIN_X, 530 - index * 28, font, 12, rgb(0.16, 0.18, 0.22)));

  drawText(page, "本文件由本地系统按材料清单自动排序并合并生成。", MARGIN_X, 120, font, 10, rgb(0.42, 0.45, 0.5));
}

function drawCatalogPages(pdfDoc, { university, profile, font, logo, materialEntries }) {
  const pageCount = Math.max(1, Math.ceil(materialEntries.length / CATALOG_ROWS_PER_PAGE));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const entries = materialEntries.slice(
      pageIndex * CATALOG_ROWS_PER_PAGE,
      (pageIndex + 1) * CATALOG_ROWS_PER_PAGE
    );
    drawCatalogPage(page, {
      university,
      profile,
      font,
      logo,
      materialEntries: entries,
      pageIndex,
      pageCount
    });
  }
}

function drawCatalogPage(page, { university, profile, font, logo, materialEntries, pageIndex, pageCount }) {
  const titleX = logo ? MARGIN_X + 58 : MARGIN_X;
  if (logo) {
    const { image, width, height } = logo;
    const maxSize = 42;
    const scale = Math.min(maxSize / width, maxSize / height);
    page.drawImage(image, {
      x: MARGIN_X,
      y: 732,
      width: width * scale,
      height: height * scale
    });
  }
  drawText(page, `${university}保研材料包目录`, titleX, 760, font, 20, rgb(0.08, 0.12, 0.16));
  drawText(page, `申请人：${profile.name || "未填写"}`, titleX, 728, font, 11, rgb(0.36, 0.39, 0.44));
  if (pageCount > 1) {
    drawText(page, `目录 ${pageIndex + 1}/${pageCount}`, PAGE_WIDTH - 126, 728, font, 10, rgb(0.42, 0.45, 0.5));
  }

  const headers = ["序号", "材料文件", "起始页"];
  drawText(page, headers[0], MARGIN_X, 680, font, 11, rgb(0.08, 0.12, 0.16));
  drawText(page, headers[1], MARGIN_X + 58, 680, font, 11, rgb(0.08, 0.12, 0.16));
  drawText(page, headers[2], PAGE_WIDTH - 112, 680, font, 11, rgb(0.08, 0.12, 0.16));
  page.drawLine({ start: { x: MARGIN_X, y: 664 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 664 }, thickness: 0.6, color: rgb(0.75, 0.77, 0.8) });

  if (!materialEntries.length) {
    drawText(page, "暂无可合并的 PDF 材料。请先上传或关联 PDF 文件。", MARGIN_X, 628, font, 12, rgb(0.5, 0.25, 0.18));
    return;
  }

  let y = 632;
  for (const entry of materialEntries) {
    if (y < 80) break;
    const seq = String(entry.seq).padStart(2, "0");
    const name = truncateToWidth(`${entry.materialName}：${entry.fileName}`, font, 10.5, 360);
    drawText(page, seq, MARGIN_X, y, font, 10.5, rgb(0.18, 0.2, 0.24));
    drawText(page, name, MARGIN_X + 58, y, font, 10.5, rgb(0.18, 0.2, 0.24));
    drawText(page, String(entry.startPage), PAGE_WIDTH - 100, y, font, 10.5, rgb(0.18, 0.2, 0.24));
    y -= 24;
  }
}

async function embedChineseFont(pdfDoc, configuredFontPath) {
  const candidates = configuredFontPath ? [configuredFontPath, ...FONT_CANDIDATES] : FONT_CANDIDATES;
  const errors = [];

  for (const candidate of candidates) {
    try {
      const fontPath = path.resolve(candidate);
      const fontBytes = await fs.readFile(fontPath);
      return await pdfDoc.embedFont(fontBytes, { subset: true });
    } catch (error) {
      errors.push(`${candidate}: ${error.message || error}`);
    }
  }

  throw new Error(`找不到可用中文字体。请在 config/app.local.json 的 export.fontPath 指向一个中文字体文件。已尝试：${errors.join("；")}`);
}

async function loadLogo(pdfDoc, university, exportConfig) {
  try {
    const logoPath = await findLogoPath(university, exportConfig);
    if (!logoPath) return null;
    const bytes = await fs.readFile(logoPath);
    const ext = path.extname(logoPath).toLowerCase();
    const image = ext === ".jpg" || ext === ".jpeg"
      ? await pdfDoc.embedJpg(bytes)
      : await pdfDoc.embedPng(bytes);
    return { image, width: image.width, height: image.height };
  } catch {
    return null;
  }
}

async function findLogoPath(university, exportConfig = {}) {
  const explicit = exportConfig.logoMap?.[university] || exportConfig.logoPath;
  if (explicit && await fileExists(explicit)) return path.resolve(explicit);

  const dirs = [
    exportConfig.logoLibraryDir,
    path.join("src", "images"),
    "logos",
    path.join("public", "logos"),
    path.join("data", "logos"),
    "uploads"
  ].filter(Boolean);

  const defaultLogo = DEFAULT_LOGO_FILES[university];
  if (defaultLogo) {
    for (const dir of dirs) {
      const candidate = path.resolve(dir, defaultLogo);
      if (await fileExists(candidate)) return candidate;
    }
  }

  const wanted = new Set([
    university,
    sanitize(university),
    university.replace(/大学$/, ""),
    sanitize(university.replace(/大学$/, ""))
  ].filter(Boolean));

  for (const dir of dirs) {
    try {
      const files = await fs.readdir(path.resolve(dir), { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) continue;
        const ext = path.extname(file.name).toLowerCase();
        if (![".png", ".jpg", ".jpeg"].includes(ext)) continue;
        const base = path.basename(file.name, ext);
        if ([...wanted].some((name) => base.includes(name) || name.includes(base))) {
          return path.resolve(dir, file.name);
        }
      }
    } catch {
      // Logo lookup is best-effort and must not block PDF export.
    }
  }

  return null;
}

function drawText(page, text, x, y, font, size, color) {
  page.drawText(String(text), { x, y, size, font, color });
}

function truncateToWidth(text, font, size, maxWidth) {
  const value = String(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let next = value;
  while (next.length > 0 && font.widthOfTextAtSize(`${next}...`, size) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function isPdfDocument(doc) {
  const fileName = doc.fileName || doc.originalFileName || doc.storedFileName || "";
  return doc.mimeType === "application/pdf" || path.extname(fileName).toLowerCase() === ".pdf";
}

function resolveInside(rootDir, fileName) {
  const root = path.resolve(rootDir);
  const fullPath = path.resolve(root, fileName);
  const relative = path.relative(root, fullPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? fullPath : null;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(path.resolve(filePath));
    return stat.isFile();
  } catch {
    return false;
  }
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.fileName);
    const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body);
    const crc = crc32(body);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.length),
      u32(body.length),
      u16(name.length),
      u16(0),
      name,
      body
    ]);
    localParts.push(local);

    centralParts.push(Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.length),
      u32(body.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name
    ]));
    offset += local.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0)
  ]);
  return Buffer.concat([...localParts, central, end]);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function sanitize(value) {
  return String(value || "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
}
