import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_DIR = path.resolve("config");
const LOCAL_CONFIG_PATH = path.join(CONFIG_DIR, "app.local.json");
const EXAMPLE_CONFIG_PATH = path.join(CONFIG_DIR, "app.example.json");

const DEFAULT_CONFIG = {
  ai: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4.1"
  },
  storage: {
    databaseFile: "data/db.json",
    uploadsDir: "uploads",
    exportsDir: "exports"
  },
  profile: {
    name: "",
    homeUniversity: "",
    major: "",
    targetMajor: "",
    submitDate: ""
  },
  export: {
    fontPath: "",
    logoPath: "",
    logoLibraryDir: "src/images",
    logoMap: {}
  }
};

export async function loadAppConfig() {
  const fileConfig = await readJsonIfExists(LOCAL_CONFIG_PATH) || await readJsonIfExists(EXAMPLE_CONFIG_PATH) || {};
  return normalizeProviderConfig(mergeConfig(DEFAULT_CONFIG, fileConfig));
}

export function publicConfig(config) {
  return {
    ai: {
      provider: config.ai.provider,
      baseUrl: config.ai.baseUrl,
      model: config.ai.model,
      apiKeyConfigured: Boolean(config.ai.apiKey?.trim())
    },
    storage: config.storage,
    profile: redactEmptyProfile(config.profile),
    export: {
      logoLibraryDir: config.export.logoLibraryDir,
      logoMapConfigured: Boolean(Object.keys(config.export.logoMap || {}).length),
      fontConfigured: Boolean(config.export.fontPath?.trim())
    }
  };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function mergeConfig(base, override) {
  return {
    ai: {
      ...base.ai,
      ...(override.ai || {})
    },
    storage: {
      ...base.storage,
      ...(override.storage || {})
    },
    profile: {
      ...base.profile,
      ...(override.profile || {})
    },
    export: {
      ...base.export,
      ...(override.export || {}),
      logoMap: {
        ...(base.export.logoMap || {}),
        ...(override.export?.logoMap || {})
      }
    }
  };
}

function redactEmptyProfile(profile) {
  return Object.fromEntries(Object.entries(profile || {}).filter(([, value]) => String(value || "").trim()));
}

function normalizeProviderConfig(config) {
  if (config.ai.provider === "zhipu") {
    const usingDefaultOpenAiUrl = !config.ai.baseUrl || config.ai.baseUrl === DEFAULT_CONFIG.ai.baseUrl;
    return {
      ...config,
      ai: {
        ...config.ai,
        baseUrl: usingDefaultOpenAiUrl ? "https://open.bigmodel.cn/api/paas/v4" : config.ai.baseUrl
      }
    };
  }
  return config;
}
