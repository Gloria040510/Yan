import { cachedBaoyanNews, cachedTechHotspots } from "./seed.js";

const BAOYAN_SOURCE = "http://pc.baoyanwang.com.cn/articles?category=%E4%BF%9D%E7%A0%94%E4%BF%A1%E6%81%AF";
const BAOYAN_API_BASE = "http://api.baoyanwang.com.cn/api/v1";
const UNIVERSITY_PATTERN = /([\u4e00-\u9fa5]{2,20}大学|中国科学院大学|中国科学技术大学|哈尔滨工业大学|北京航空航天大学)/;
const ARTICLE_URL_PATTERN = /\/articles\/(\d+)/g;
const TECH_YEAR = 2026;
const TECH_SOURCES = [
  {
    name: "量子位",
    feedUrl: "https://www.qbitai.com/feed",
    urls: [
      "https://www.qbitai.com/2026/05/412080.html",
      "https://www.qbitai.com/"
    ]
  },
  {
    name: "机器之心",
    feedUrl: "https://www.jiqizhixin.com/rss",
    urls: [
      "https://www.jiqizhixin.com/articles/2026-05-04-4",
      "https://www.jiqizhixin.com/articles"
    ]
  }
];
const TECH_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 Yan/0.1",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

export async function fetchBaoyanNews({ force = false, currentCache } = {}) {
  const previous = currentCache?.items?.length ? currentCache.items : cachedBaoyanNews;
  try {
    const apiItems = await fetchBaoyanApiArticles();
    if (apiItems.length) {
      return {
        ok: true,
        updatedAt: new Date().toISOString(),
        stale: false,
        message: "已从保研信息网 API 更新。",
        items: mergeDedupe(apiItems, previous)
      };
    }

    const response = await fetch(BAOYAN_SOURCE, {
      headers: {
        "user-agent": "Yan/0.1 (+local prototype)",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const parsed = await parseBaoyanHtml(html);
    const items = parsed.length ? mergeDedupe(parsed, previous) : previous;
    return {
      ok: parsed.length > 0,
      updatedAt: new Date().toISOString(),
      stale: parsed.length === 0,
      message: parsed.length ? "已从保研信息网增量抓取。" : "页面未解析到 2026 保研条目，显示缓存数据。",
      items
    };
  } catch (error) {
    return {
      ok: false,
      updatedAt: currentCache?.updatedAt || new Date().toISOString(),
      stale: true,
      message: `爬虫失败，显示缓存数据：${error.message}`,
      items: previous,
      force
    };
  }
}

async function fetchBaoyanApiArticles() {
  const url = new URL(`${BAOYAN_API_BASE}/articles`);
  url.searchParams.set("page", "1");
  url.searchParams.set("size", "25");
  url.searchParams.set("category", "保研信息");
  url.searchParams.set("all", "1");

  const response = await fetch(url, {
    headers: {
      "user-agent": "Yan/0.1 (+local prototype)",
      "accept": "application/json",
      "x-auth-device": "web"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload?.result?.content;
  if (!payload?.success || !Array.isArray(content)) return [];
  return content.map(articleFromApi).filter(Boolean);
}

function articleFromApi(article) {
  const content = parseJsonObject(article.content);
  const tags = splitTags(article.tags);
  const title = article.title || [article.college, article.academy].filter(Boolean).join("——") || "未命名资讯";
  const summary = content.p || article.description || title;
  const haystack = `${title} ${summary} ${tags.join(" ")} ${article.year || ""} ${article.sign_up_start || ""} ${article.sign_up_end || ""}`;
  if (!/2026/.test(haystack)) return null;

  return {
    id: `news-${article.id}`,
    title,
    publishedAt: normalizeApiDate(article.created_at),
    university: article.college || extractUniversity(title),
    school: article.academy || extractSchool(title),
    discipline: article.subject || extractDiscipline(`${title} ${summary} ${article.major || ""}`),
    projectType: extractProjectType(`${title} ${summary} ${tags.join(" ")}`),
    deadline: dateOnly(article.sign_up_end),
    registrationStart: dateOnly(article.sign_up_start),
    registrationEnd: dateOnly(article.sign_up_end),
    activityStart: dateOnly(article.start_time),
    activityEnd: dateOnly(article.end_time),
    tags: article.year ? [...tags, String(article.year)] : tags,
    url: absolutize(`/articles/${article.id}`),
    officeUrl: article.office_url || article.gzh_url || "",
    signUpUrl: article.sign_up_url || "",
    summary: truncate(summary, 200),
    structured: true,
    source: "保研信息网 API",
    applyCount: article.apply_cnt || 0,
    watchCount: article.watch_cnt || 0
  };
}

export async function fetchTechHotspots({ currentCache } = {}) {
  const previous = currentCache?.items?.length ? currentCache.items : cachedTechHotspots;
  const sources = TECH_SOURCES.map((source) => source.name);
  const results = await Promise.allSettled(TECH_SOURCES.map(fetchTechSource));
  const fresh = results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((item) => publishedInYear(item.publishedAt, TECH_YEAR));

  if (fresh.length) {
    const reusablePrevious = previous.filter(isReusableTechCache);
    return {
      ok: true,
      stale: false,
      updatedAt: new Date().toISOString(),
      sources,
      message: `已从网页端更新 ${fresh.length} 条 ${TECH_YEAR} 年科技资讯。`,
      items: mergeDedupe(fresh, reusablePrevious)
    };
  }

  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message)
    .filter(Boolean);
  return {
    ok: false,
    stale: true,
    updatedAt: currentCache?.updatedAt || new Date().toISOString(),
    sources,
    message: errors.length
      ? `网页端资讯暂未抓到 ${TECH_YEAR} 年条目，显示缓存：${errors.join("；")}`
      : `网页端资讯暂未抓到 ${TECH_YEAR} 年条目，显示缓存。`,
    items: previous
  };
}

async function fetchTechSource(source) {
  const items = [];
  if (source.feedUrl) {
    const feed = await fetchText(source.feedUrl);
    items.push(...parseRssFeed(feed, source.name));
  }

  if (!items.length) {
    const pages = await Promise.allSettled(source.urls.map((url) => fetchText(url)));
    for (const page of pages) {
      if (page.status !== "fulfilled") continue;
      items.push(...parseTechHtml(page.value, source.name));
      items.push(...parseTechLinks(page.value, source.name));
    }
  }

  return items.filter((item) => publishedInYear(item.publishedAt, TECH_YEAR)).slice(0, 12);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: TECH_HEADERS,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

function parseRssFeed(xml, source) {
  const items = extractXmlBlocks(xml, "item");
  return items.map((item, index) => {
    const title = cleanText(readXmlTag(item, "title"));
    const url = cleanText(readXmlTag(item, "link")) || extractXmlLink(item);
    const publishedAt = normalizeTechDate(readXmlTag(item, "pubDate") || readXmlTag(item, "dc:date") || readXmlTag(item, "updated"));
    if (!title || !url || !publishedInYear(publishedAt, TECH_YEAR)) return null;
    const tags = extractXmlBlocks(item, "category").map((tag) => cleanText(tag)).filter(Boolean);
    const description = cleanText(readXmlTag(item, "description") || readXmlTag(item, "content:encoded"));
    return techItem({
      source,
      title,
      publishedAt,
      url,
      summary: description || title,
      tags,
      index
    });
  }).filter(Boolean);
}

function parseTechHtml(html, source) {
  if (isDataServicePage(html)) return [];
  const title = cleanText(metaContent(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const url = metaContent(html, "og:url") || metaContent(html, "canonical") || extractCanonical(html);
  const description = cleanText(metaContent(html, "og:description") || metaContent(html, "description") || firstParagraph(html));
  const publishedAt = normalizeTechDate(
    metaContent(html, "article:published_time")
    || extractTimeValue(html)
    || dateFromUrl(url)
    || html.match(/20\d{2}-\d{1,2}-\d{1,2}/)?.[0]
  );
  if (!title || !url || !publishedInYear(publishedAt, TECH_YEAR)) return [];
  const tags = extractMetaKeywords(html);
  return [techItem({ source, title, publishedAt, url, summary: description || title, tags })];
}

function parseTechLinks(html, source) {
  if (isDataServicePage(html)) return [];
  const pattern = /<a[^>]+href=["']([^"']*(?:qbitai\.com\/20\d{2}\/\d{2}\/\d+\.html|jiqizhixin\.com\/articles\/20\d{2}-\d{2}-\d{2}[^"']*))["'][^>]*>([\s\S]*?)<\/a>/gi;
  const items = [];
  let match;
  while ((match = pattern.exec(html))) {
    const url = absolutizeTechUrl(match[1], source);
    const title = cleanText(match[2]);
    const publishedAt = normalizeTechDate(dateFromUrl(url));
    if (!title || !url || !publishedInYear(publishedAt, TECH_YEAR)) continue;
    items.push(techItem({ source, title, publishedAt, url, summary: title, tags: [] }));
  }
  return items;
}

function techItem({ source, title, publishedAt, url, summary, tags = [], index = 0 }) {
  const topic = inferTechTopic(`${title} ${summary} ${tags.join(" ")}`);
  const normalizedTags = [...new Set([topic, ...tags].filter(Boolean))].slice(0, 5);
  return {
    id: `tech-${hash(`${source}:${title}:${url}:${index}`)}`,
    source,
    title,
    publishedAt,
    topic,
    url,
    summary: truncate(cleanText(summary), 180),
    tags: normalizedTags,
    cached: false
  };
}

function inferTechTopic(text) {
  if (/Agent|智能体|Claude Code|代码|编程|Cursor/i.test(text)) return "AI Agent";
  if (/机器人|具身|仿真|世界模型/i.test(text)) return "具身智能";
  if (/部署|端侧|芯片|推理|算力|量化/i.test(text)) return "模型部署";
  if (/DeepSeek|GPT|Claude|Gemini|模型|大模型|Scaling/i.test(text)) return "大模型";
  if (/自动驾驶|无人车|智能车/i.test(text)) return "自动驾驶";
  return "AI 热点";
}

function extractXmlBlocks(xml, tagName) {
  const escaped = tagName.replace(":", "\\:");
  const pattern = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1]);
}

function readXmlTag(xml, tagName) {
  return extractXmlBlocks(xml, tagName)[0] || "";
}

function extractXmlLink(item) {
  const match = item.match(/<link[^>]+href=["']([^"']+)["']/i);
  return match?.[1] || "";
}

function metaContent(html, name) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  return decodeEntities(pattern.exec(html)?.[1] || "");
}

function extractCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || "";
}

function extractTimeValue(html) {
  return html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || "";
}

function firstParagraph(html) {
  return html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
}

function extractMetaKeywords(html) {
  const keywords = metaContent(html, "keywords");
  return keywords.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function dateFromUrl(url = "") {
  const qbit = url.match(/\/(20\d{2})\/(\d{2})\/\d+\.html/);
  if (qbit) return `${qbit[1]}-${qbit[2]}-01`;
  return url.match(/20\d{2}-\d{2}-\d{2}/)?.[0] || "";
}

function normalizeTechDate(value) {
  const text = cleanText(value).replace(/\//g, "-");
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  const match = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00.000Z`).toISOString();
}

function publishedInYear(value, year) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year;
}

function isReusableTechCache(item) {
  return sourcesIncludesTech(item?.source)
    && publishedInYear(item?.publishedAt, TECH_YEAR)
    && /^https?:\/\//.test(item?.url || "")
    && !/mp\.weixin\.qq\.com/i.test(item.url)
    && item.cached !== true;
}

function sourcesIncludesTech(source) {
  return TECH_SOURCES.some((item) => item.name === source);
}

function isDataServicePage(html) {
  return /机器之心·数据服务|还在<em>费劲<\/em>爬数据/.test(html);
}

function cleanText(value) {
  return decodeEntities(stripTags(String(value || "").replace(/<!\[CDATA\[|\]\]>/g, ""))).replace(/\s+/g, " ").trim();
}

function absolutizeTechUrl(url, source) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = source === "机器之心" ? "https://www.jiqizhixin.com" : "https://www.qbitai.com";
  return new URL(url, base).toString();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function parseBaoyanHtml(html) {
  const cardItems = parseArticleCards(html);
  if (cardItems.length) return cardItems;

  const linkItems = parseArticleLinks(html);
  if (linkItems.length) return linkItems;

  const articleIds = [...new Set([...html.matchAll(ARTICLE_URL_PATTERN)].map((match) => match[1]))].slice(0, 24);
  if (!articleIds.length) return [];

  const detailPages = await Promise.allSettled(articleIds.map((id) => fetchArticleDetail(id)));
  return detailPages
    .filter((item) => item.status === "fulfilled" && item.value)
    .map((item) => item.value);
}

function parseArticleCards(html, fallbackUrl = BAOYAN_SOURCE) {
  const cards = extractBlocksByClass(html, "article-meta-info");
  return cards.map((card, index) => articleFromCard(card, fallbackUrl, index)).filter(Boolean);
}

function articleFromCard(card, fallbackUrl, index = 0) {
  const rawTitle = textFromClass(card, "article-title");
  const desc = textFromClass(card, "article-desc");
  const registrationRaw = textFromClass(card, "article-start-time").replace(/^报名时间[:：]\s*/, "");
  const activityRaw = textFromClass(card, "article-end-time").replace(/^活动时间[:：]\s*/, "");
  const tags = extractAllTextFromClass(card, "article-tag-title");
  const href = extractHrefAround(card) || fallbackUrl;
  const title = normalizeTitle(rawTitle, desc);
  const dates = {
    registration: parseRange(registrationRaw),
    activity: parseRange(activityRaw)
  };

  const haystack = `${title} ${desc} ${tags.join(" ")} ${registrationRaw} ${activityRaw}`;
  if (!/2026/.test(haystack)) return null;

  const university = extractUniversity(title);
  const school = extractSchool(title) !== "需人工确认" ? extractSchool(title) : extractSchool(desc);
  const projectType = extractProjectType(`${title} ${desc} ${tags.join(" ")}`);
  const deadline = dates.registration?.end || dates.activity?.end || null;

  return {
    id: `news-${hash(`${title}:${href}:${index}`)}`,
    title,
    publishedAt: null,
    university,
    school,
    discipline: extractDiscipline(`${title} ${desc}`),
    projectType,
    deadline,
    registrationStart: dates.registration?.start || null,
    registrationEnd: dates.registration?.end || null,
    activityStart: dates.activity?.start || null,
    activityEnd: dates.activity?.end || null,
    tags,
    url: href,
    summary: desc || title,
    structured: false,
    source: "保研信息网"
  };
}

function parseArticleLinks(html) {
  const articles = [];
  const linkPattern = /<a[^>]+href=["']([^"']*\/articles\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const url = absolutize(match[1]);
    const title = stripTags(match[2]).replace(/\s+/g, " ").trim();
    if (!title || !/2026/.test(title)) continue;
    const university = extractUniversity(title);
    articles.push({
      id: `news-${hash(`${title}:${url}`)}`,
      title,
      publishedAt: null,
      university,
      school: extractSchool(title),
      discipline: extractDiscipline(title),
      projectType: extractProjectType(title),
      deadline: extractDeadline(title),
      url,
      summary: title.slice(0, 180),
      structured: false,
      source: "保研信息网"
    });
  }
  return articles;
}

async function fetchArticleDetail(id) {
  const url = absolutize(`/articles/${id}`);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Yan/0.1 (+local prototype)",
        "accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const html = await response.text();
    const cards = parseArticleCards(html, url);
    if (cards[0]) return { ...cards[0], url };

    const title = textFromClass(html, "article-title") || stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
    if (!title || !/2026/.test(html)) return null;
    const desc = textFromClass(html, "article-desc");
    const registrationRaw = textFromClass(html, "article-start-time").replace(/^报名时间[:：]\s*/, "");
    const activityRaw = textFromClass(html, "article-end-time").replace(/^活动时间[:：]\s*/, "");
    const tags = extractAllTextFromClass(html, "article-tag-title");
    const registration = parseRange(registrationRaw);
    const activity = parseRange(activityRaw);
    return {
      id: `news-${hash(`${title}:${url}`)}`,
      title: normalizeTitle(title, desc),
      publishedAt: null,
      university: extractUniversity(title),
      school: extractSchool(title),
      discipline: extractDiscipline(`${title} ${desc}`),
      projectType: extractProjectType(`${title} ${desc} ${tags.join(" ")}`),
      deadline: registration?.end || activity?.end || null,
      registrationStart: registration?.start || null,
      registrationEnd: registration?.end || null,
      activityStart: activity?.start || null,
      activityEnd: activity?.end || null,
      tags,
      url,
      summary: desc || title,
      structured: false,
      source: "保研信息网"
    };
  } catch {
    return null;
  }
}

function mergeDedupe(fresh, previous) {
  const byKey = new Map();
  for (const item of [...fresh, ...previous]) {
    const key = `${item.title}:${item.url}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()].sort((a, b) => new Date(sortDate(b)) - new Date(sortDate(a)));
}

function sortDate(item) {
  return item.publishedAt || item.registrationStart || item.activityStart || item.deadline || "1970-01-01";
}

function extractProjectType(title) {
  if (/领创体验营|体验营/.test(title)) return "体验营";
  if (/宣讲会/.test(title)) return "宣讲会";
  if (/夏令营/.test(title)) return "夏令营";
  if (/预推免|预报名/.test(title)) return "预推免";
  if (/直博|直推/.test(title)) return "直推";
  if (/推荐免试|推免/.test(title)) return "预推免";
  return "需人工确认";
}

function extractSchool(title) {
  const match = title.match(/([\u4e00-\u9fa5]{2,24}(?:学院|学系|系|研究院))/);
  return match?.[1] || "需人工确认";
}

function extractDiscipline(title) {
  if (/计算机|软件|人工智能|数据/.test(title)) return "计算机类";
  if (/电子|通信|信息/.test(title)) return "电子信息";
  if (/自动化|机器人|智能/.test(title)) return "人工智能";
  return "未分类";
}

function extractDeadline(title) {
  const isoRange = title.match(/(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2})/);
  if (isoRange) return isoRange[2];
  const match = title.match(/(?:截止|至)\s*(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  const year = match[1] || "2026";
  return `${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function splitTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function dateOnly(value) {
  const match = String(value || "").match(/20\d{2}-\d{2}-\d{2}/);
  return match?.[0] || null;
}

function normalizeApiDate(value) {
  const text = String(value || "").replace(/\//g, "-");
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function truncate(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function extractBlocksByClass(html, className) {
  const blocks = [];
  const openTag = new RegExp(`<([a-z][\\w-]*)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, "gi");
  let match;
  while ((match = openTag.exec(html))) {
    const start = match.index;
    const tag = match[1];
    let depth = 0;
    const tagPattern = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
    tagPattern.lastIndex = start;
    let tagMatch;
    while ((tagMatch = tagPattern.exec(html))) {
      if (tagMatch[0][1] === "/") depth -= 1;
      else depth += 1;
      if (depth === 0) {
        blocks.push(html.slice(start, tagPattern.lastIndex));
        openTag.lastIndex = tagPattern.lastIndex;
        break;
      }
    }
  }
  return blocks;
}

function textFromClass(html, className) {
  const block = extractBlocksByClass(html, className)[0];
  return block ? decodeEntities(stripTags(block)).replace(/\s+/g, " ").trim() : "";
}

function extractAllTextFromClass(html, className) {
  return extractBlocksByClass(html, className)
    .map((block) => decodeEntities(stripTags(block)).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractHrefAround(html) {
  const match = html.match(/href=["']([^"']*\/articles\/\d+[^"']*)["']/i);
  return match ? absolutize(match[1]) : "";
}

function normalizeTitle(title, desc = "") {
  const cleaned = decodeEntities(title).replace(/[【】]/g, "").replace(/[—-]{2,}/g, "——").trim();
  if (!cleaned) return desc || "未命名资讯";
  return cleaned;
}

function parseRange(raw) {
  const match = raw.match(/(20\d{2}-\d{2}-\d{2})\s*~\s*(20\d{2}-\d{2}-\d{2})/);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function extractUniversity(text) {
  return text.match(UNIVERSITY_PATTERN)?.[1] || "需人工确认";
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function absolutize(url) {
  if (/^https?:\/\//.test(url)) return url;
  return new URL(url, BAOYAN_SOURCE).toString();
}

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}
