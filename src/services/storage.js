import fs from "node:fs/promises";
import path from "node:path";
import { parseNotice } from "./parser.js";
import { cachedBaoyanNews, cachedTechHotspots, defaultProfile, sampleNoticeText, userDocuments } from "./seed.js";

const DB_PATH = path.resolve("data", "db.json");
const SCHEMA_VERSION = 2;

export async function loadState() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const state = JSON.parse(raw);
    if (state.version === SCHEMA_VERSION) {
      let changed = false;
      if (!state.news?.items?.some((item) => item.id === "news-19476")) {
        state.news = {
          ...(state.news || {}),
          items: [...cachedBaoyanNews, ...(state.news?.items || [])]
        };
        changed = true;
      }
      for (const application of state.applications || []) {
        if (application.materials?.length) continue;
        const reparsed = parseNotice(application.original?.text || "", {
          id: application.id,
          fileName: application.original?.fileName,
          year: 2026
        });
        if (reparsed.materials.length) {
          application.materials = reparsed.materials;
          application.assignments = reparsed.assignments;
          application.safety = reparsed.safety;
          changed = true;
        }
      }
      for (const application of state.applications || []) {
        if (application.materialLinks) continue;
        const links = {};
        for (const material of application.materials || []) {
          const doc = (state.documents || []).find((item) => item.normalizedName === material.name_normalized);
          if (doc) links[String(material.ordinal)] = doc.id;
        }
        if (Object.keys(links).length) {
          application.materialLinks = links;
          changed = true;
        }
      }
      if (changed) await saveState(state);
      return state;
    }
    return await createInitialState();
  } catch {
    return await createInitialState();
  }
}

export async function saveState(state) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function publicState(state, matchFn) {
  return {
    ...state,
    applications: state.applications.map((application) => ({
      ...application,
      match: matchFn(application, state.documents)
    }))
  };
}

async function createInitialState() {
  const firstApplication = parseNotice(sampleNoticeText, {
    id: "app-fudan-demo",
    fileName: "复旦大学计算机科学技术学院2026推免通知.txt",
    year: 2026
  });
  const state = {
    version: SCHEMA_VERSION,
    profile: defaultProfile,
    applications: [firstApplication],
    documents: userDocuments,
    news: {
      ok: true,
      stale: true,
      updatedAt: "2026-05-05T09:00:00.000Z",
      message: "使用内置保研资讯缓存。",
      items: cachedBaoyanNews
    },
    techHotspots: {
      ok: true,
      stale: true,
      updatedAt: "2026-05-05T09:00:00.000Z",
      message: "使用内置科技热点缓存。",
      items: cachedTechHotspots
    },
    exports: []
  };
  await saveState(state);
  return state;
}
