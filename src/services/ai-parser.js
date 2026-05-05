export async function parseNoticeWithAi({ text, config, ruleResult }) {
  if (!config?.ai?.apiKey?.trim()) return null;
  const body = buildRequestBody({ text, config, ruleResult, jsonMode: true, providerOptions: true });
  let response = await postChatCompletion(config, body);
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    response = await postChatCompletion(config, buildRequestBody({ text, config, ruleResult, jsonMode: false, providerOptions: true }));
  }
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    response = await postChatCompletion(config, buildRequestBody({ text, config, ruleResult, jsonMode: false, providerOptions: false }));
  }
  if (!response.ok) throw await httpError(response, config);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI response missing content");
  return parseJsonContent(content);
}

async function postChatCompletion(config, body) {
  const url = chatCompletionsUrl(config.ai.baseUrl);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${config.ai.apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    throw networkError(error, url);
  }
}

function buildRequestBody({ text, config, ruleResult, jsonMode, providerOptions }) {
  const provider = config.ai.provider || "openai-compatible";
  return {
    model: config.ai.model,
    temperature: 0,
    ...(providerOptions && provider === "zhipu" ? { thinking: { type: "disabled" } } : {}),
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages: [
      {
        role: "system",
        content: [
          "你是推免通知结构化解析器。只从原文抽取，不要编造。",
          "返回严格 JSON，字段包括 basicInfo、requirements、materials、timeline。",
          "materials 只能逐条列出申请人必须上传、提交、邮寄或系统填报附件的材料文件。每条材料包含：raw_text, name_original, name_normalized, is_required, form, seal_required, quantity, page_limit, word_limit, format_note, source_blocks。",
          "不要把报名时间、报名链接、系统网址、官网/公众号、招生宣传活动、报考方向/研究方向、学院介绍、联系方式、考核安排、导师名单、普通说明句解析为 materials。",
          "若原文只是要求在系统里填写个人信息、选择报考方向、关注网站通知或打开链接报名，这些不是材料；应放入 requirements/timeline/basicInfo，materials 中不要出现。",
          "材料名称必须像文件/证明/证书/表格/申请表/成绩单/推荐信/简历/陈述/计划书/身份证/学生证/论文/获奖材料等可上传实体。无法判断为实体材料时不要输出。",
          "如果某个 block 同时包含说明和材料，只抽其中的材料短语，不要整段复制。",
          "is_required 只能是 must, optional, conditional 或 null。form 只能是 electronic, original_scan, copy 或 null。",
          "source_blocks 必须使用用户提供的 block id。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          fileName: ruleResult.original.fileName,
          blocks: ruleResult.original.blocks.map((block) => ({
            id: block.id,
            text: block.text
          })),
          text
        })
      }
    ]
  };
}

function chatCompletionsUrl(baseUrl = "https://api.openai.com/v1") {
  const trimmed = String(baseUrl).replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

async function httpError(response, config) {
  const bodyText = await response.text().catch(() => "");
  const providerMessage = extractProviderMessage(bodyText);
  const hint = httpHint(response.status);
  const safeUrl = chatCompletionsUrl(config.ai.baseUrl).replace(/[?].*$/, "");
  return new Error([
    `AI HTTP ${response.status} ${response.statusText || ""}`.trim(),
    `请求地址：${safeUrl}`,
    providerMessage ? `服务返回：${providerMessage}` : "",
    hint ? `排查建议：${hint}` : ""
  ].filter(Boolean).join("；"));
}

function networkError(error, url) {
  const cause = error?.cause || {};
  const code = cause.code || error.code || error.name || "";
  const host = cause.hostname || safeHostname(url);
  const detail = [
    `网络请求失败：${error.message || "fetch failed"}`,
    code ? `错误码：${code}` : "",
    host ? `目标主机：${host}` : "",
    cause.syscall ? `系统调用：${cause.syscall}` : "",
    networkHint(code, host)
  ].filter(Boolean).join("；");
  return new Error(detail);
}

function extractProviderMessage(bodyText) {
  if (!bodyText) return "";
  try {
    const json = JSON.parse(bodyText);
    return json.error?.message || json.message || bodyText.slice(0, 300);
  } catch {
    return bodyText.replace(/\s+/g, " ").slice(0, 300);
  }
}

function httpHint(status) {
  if (status === 401) return "API Key 无效、已过期，或 provider/baseUrl 与 Key 不匹配。";
  if (status === 403) return "Key 没有权限访问该模型，或账号/地区/组织权限受限。";
  if (status === 404) return "baseUrl 可能写错，或模型名不存在。OpenAI-compatible 地址通常应以 /v1 结尾。";
  if (status === 429) return "额度不足、限流，或请求过于频繁。";
  if (status >= 500) return "模型服务端异常，可以稍后重试或切换 baseUrl。";
  return "";
}

function networkHint(code, host) {
  if (code === "ENOTFOUND") return "DNS 无法解析，请检查 baseUrl 域名、网络或代理。";
  if (code === "ECONNREFUSED") return "目标端口拒绝连接，请检查 baseUrl 端口或本地代理是否启动。";
  if (code === "ECONNRESET") return "连接被重置，常见于网络阻断、代理不通或 TLS 被中断。";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return "连接超时，请检查网络、代理或服务是否可达。";
  if (code === "TimeoutError" || code === "AbortError") return "请求超时，后端 Node 进程没有在 30 秒内连上模型服务。请检查网络、代理或换用可达的 baseUrl。";
  if (code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "TLS 证书校验失败，请检查代理证书或服务证书。";
  if (/api\.openai\.com/i.test(host || "")) return "Node 后端直连 api.openai.com 失败；如果浏览器能访问但后端失败，通常是 Node 没走系统代理，需要换可达的 OpenAI-compatible baseUrl 或给 Node 配代理。";
  return "请检查 baseUrl 是否可由后端 Node 进程访问。";
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function parseJsonContent(content) {
  const cleaned = String(content).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response is not JSON");
    return JSON.parse(match[0]);
  }
}
