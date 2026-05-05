const GLOBAL_MATERIAL_DICT = new Map([
  ["成绩单", "本科成绩单"],
  ["本科成绩单", "本科成绩单"],
  ["历年成绩单", "本科成绩单"],
  ["专业排名证明", "专业排名证明"],
  ["成绩排名证明", "专业排名证明"],
  ["学业排名证明", "专业排名证明"],
  ["年级排名证明", "专业排名证明"],
  ["推荐信", "专家推荐信"],
  ["专家推荐信", "专家推荐信"],
  ["教授推荐信", "专家推荐信"],
  ["个人陈述", "个人陈述"],
  ["个人自述", "个人陈述"],
  ["学习计划", "个人陈述"],
  ["研究计划", "研究计划书"],
  ["研究计划书", "研究计划书"],
  ["拟研究方向陈述", "研究计划书"],
  ["英语证明", "英语水平证明"],
  ["CET 成绩单", "英语水平证明"],
  ["CET6成绩单", "英语水平证明"],
  ["英语等级证书", "英语水平证明"],
  ["英语水平证明", "英语水平证明"],
  ["身份证", "身份证复印件"],
  ["身份证复印件", "身份证复印件"],
  ["二代身份证", "身份证复印件"],
  ["学生证", "学生证复印件"],
  ["学生证复印件", "学生证复印件"],
  ["申请表", "推免申请表"],
  ["报名表", "推免申请表"],
  ["推免申请表", "推免申请表"],
  ["简历", "个人简历"],
  ["个人简历", "个人简历"],
  ["CV", "个人简历"],
  ["承诺书", "诚信承诺书"],
  ["诚信承诺书", "诚信承诺书"],
  ["廉洁承诺书", "诚信承诺书"],
  ["获奖证书", "获奖证书"],
  ["论文", "科研成果材料"],
  ["专利", "科研成果材料"],
  ["科研成果", "科研成果材料"]
]);

const PROGRAM_TYPES = [
  ["夏令营", "summer_camp"],
  ["预推免", "pre_recommendation"],
  ["推荐免试", "pre_recommendation"],
  ["直博", "direct_admission"],
  ["直推", "direct_admission"]
];

const STRICT_SEALS = ["教务处章", "院章", "公章", "本人签字", "推荐人亲签", "注册章", "防伪标识"];

const CHINESE_NUMBERS = new Map([
  ["一", 1],
  ["二", 2],
  ["两", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
  ["十", 10]
]);

export function parseNotice(rawText, meta = {}) {
  const text = normalizeText(rawText);
  const blocks = segmentDocument(text);
  const assignments = classifyBlocks(blocks);
  const moduleBlocks = groupByModule(blocks, assignments);
  const basicInfo = extractBasicInfo(moduleBlocks.basic_info, blocks);
  const requirements = extractRequirements(moduleBlocks.requirements);
  const materials = normalizeMaterialOrdinals(extractMaterials(moduleBlocks.material_list).length
    ? extractMaterials(moduleBlocks.material_list)
    : extractMaterialsFromAllBlocks(blocks));
  const timeline = extractTimeline(moduleBlocks.timeline, meta.year || 2026);
  const original = {
    fileName: meta.fileName || "院校通知.txt",
    text,
    blocks
  };

  return {
    id: meta.id || createId("app"),
    createdAt: new Date().toISOString(),
    status: "待补充",
    original,
    assignments,
    basicInfo,
    requirements,
    materials,
    timeline,
    safety: {
      hallucinationGuard: "字段仅来自原文 block；未命中字典或未出现明确文字时标记为需人工确认。",
      lowConfidenceBlocks: blocks.filter((block) => block.ocr_conf < 0.85).map((block) => block.id)
    }
  };
}

export function mergeAiNoticeParse(ruleResult, aiResult = {}) {
  const blocks = ruleResult.original.blocks;
  return {
    ...ruleResult,
    basicInfo: mergeBasicInfo(ruleResult.basicInfo, aiResult.basicInfo, blocks),
    requirements: normalizeAiRequirements(aiResult.requirements, blocks, ruleResult.requirements),
    materials: normalizeMaterialOrdinals(normalizeAiMaterials(aiResult.materials, blocks, ruleResult.materials)),
    timeline: normalizeAiTimeline(aiResult.timeline, blocks, ruleResult.timeline)
  };
}

function normalizeText(rawText) {
  const text = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return "";
  return text;
}

function segmentDocument(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const isHeading = /^([一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十]+[章节])/.test(line);
    const isList = /^(\d+|[（(]?\d+[）)]?)[.、．]/.test(line);
    const type = index === 0 ? "title" : isList ? "list_item" : isHeading ? "heading" : "paragraph";
    return {
      id: `b${String(index + 1).padStart(3, "0")}`,
      page: Math.floor(index / 18) + 1,
      type,
      text: line,
      bbox: [48, 80 + (index % 18) * 32, 780, 104 + (index % 18) * 32],
      ocr_conf: 0.99
    };
  });
}

function classifyBlocks(blocks) {
  let current = "basic_info";
  return blocks.map((block) => {
    const text = block.text;
    if (/申请条件|报名条件|申报条件|资格条件/.test(text)) current = "requirements";
    if (/申请材料|提交材料|材料清单|报名材料/.test(text)) current = "material_list";
    if (current === "material_list" && isMaterialSectionBoundary(text) && !/申请材料|提交材料|材料清单|报名材料/.test(text)) current = "_other";
    if (/时间安排|日程安排|报名时间|截止|面试时间|公示/.test(text)) current = "timeline";
    if (/联系方式|咨询电话|附件|其他事项/.test(text)) current = "_other";

    let module = current;
    if (block.type === "title") module = "basic_info";
    if (current === "material_list" && block.type === "list_item") module = "material_list";
    if (/申请材料|提交材料|材料清单|报名材料/.test(text)) module = "material_list";
    if (module === "material_list" && isMaterialSectionBoundary(text) && !/申请材料|提交材料|材料清单|报名材料/.test(text)) module = "_other";
    if (/报名时间|初审|面试|录取|公示|截止|公布|时间安排/.test(text)) module = "timeline";
    if (module !== "material_list" && /成绩|排名|英语|科研|门槛|条件/.test(text) && !/材料/.test(text)) module = "requirements";

    return {
      block_id: block.id,
      module,
      confidence: module === "_other" ? 0.72 : 0.88
    };
  });
}

function groupByModule(blocks, assignments) {
  const grouped = {
    basic_info: [],
    requirements: [],
    material_list: [],
    timeline: [],
    _other: []
  };
  const byId = new Map(assignments.map((item) => [item.block_id, item.module]));
  for (const block of blocks) grouped[byId.get(block.id) || "_other"].push(block);
  return grouped;
}

function extractBasicInfo(blocks, allBlocks) {
  const joined = blocks.map((block) => block.text).join("\n");
  const title = allBlocks[0]?.text || joined;
  const university = findWithSource(/([\u4e00-\u9fa5]{2,20}大学)/, allBlocks);
  const school = findWithSource(/([\u4e00-\u9fa5]{2,30}(?:学院|学系|系|研究院))/, allBlocks);
  const program = PROGRAM_TYPES.find(([keyword]) => joined.includes(keyword) || title.includes(keyword));
  const directions = extractAfter(joined, /招生方向(?:包括|为)?([^。\n]+)/);
  const degreeTypes = [];
  if (/学术学位/.test(joined)) degreeTypes.push("academic");
  if (/专业学位/.test(joined)) degreeTypes.push("professional");

  return {
    university: field(university?.value ?? null, university ? [university.blockId] : [], "原文未出现明确院校名称"),
    school: field(school?.value ?? null, school ? [school.blockId] : [], "原文未出现明确学院/院系名称"),
    program_type: field(program?.[1] ?? null, program ? sourceBlocksContaining(allBlocks, program[0]) : [], "原文未出现夏令营/预推免/直推等明确项目类型"),
    directions: {
      value: directions.length ? directions : [],
      source: directions.length ? sourceBlocksContaining(allBlocks, directions[0]) : [],
      reason_if_empty: directions.length ? "" : "原文未出现明确招生方向"
    },
    degree_types: {
      value: degreeTypes,
      source: degreeTypes.length ? sourceBlocksContaining(allBlocks, degreeTypes.includes("academic") ? "学术学位" : "专业学位") : [],
      reason_if_empty: degreeTypes.length ? "" : "原文未出现明确学位类型"
    }
  };
}

function extractRequirements(blocks) {
  const rows = [];
  for (const block of blocks) {
    const text = block.text;
    if (/排名|成绩/.test(text)) rows.push(requirement("成绩排名", text, block.id));
    if (/英语|CET|雅思|托福/.test(text)) rows.push(requirement("英语水平", text, block.id));
    if (/科研|论文|专利|竞赛/.test(text)) rows.push(requirement("科研经历", text, block.id));
    if (/应届|本科毕业生|门槛|条件/.test(text)) rows.push(requirement("其他硬性门槛", text, block.id));
  }
  return dedupeBy(rows, (row) => `${row.category}:${row.raw_text}`);
}

function extractMaterials(blocks) {
  const itemLines = [];
  for (const block of blocks) {
    if (block.type === "heading") continue;
    const split = splitMaterialLine(block.text);
    for (const text of split) {
      if (isMaterialCandidate(text)) itemLines.push({ text, block });
    }
  }

  return itemLines.map(({ text, block }, index) => {
    const nameOriginal = detectMaterialName(text);
    const normalized = normalizeMaterialName(text);
    const item = {
      ordinal: index + 1,
      raw_text: text,
      source_blocks: [block.id],
      name_original: nameOriginal,
      name_normalized: normalized,
      is_required: detectRequired(text),
      form: detectForm(text),
      seal_required: detectSeals(text),
      quantity: detectQuantity(text),
      page_limit: detectPageLimit(text),
      word_limit: detectWordLimit(text),
      format_note: detectFormatNote(text)
    };
    const uncertainFields = Object.entries(item)
      .filter(([key, value]) => !["ordinal", "raw_text", "source_blocks", "name_original"].includes(key) && (value === null || (Array.isArray(value) && value.length === 0)))
      .map(([key]) => key);
    item._uncertain = uncertainFields.length > 0;
    item._uncertain_fields = uncertainFields;
    return item;
  });
}

function extractMaterialsFromAllBlocks(blocks) {
  const sectionBlocks = [];
  let inSection = false;
  for (const block of blocks) {
    const text = block.text;
    if (/申请材料|提交材料|材料清单|报名材料|需提交.*材料|上传.*材料|材料要求/.test(text)) {
      inSection = true;
      sectionBlocks.push(block);
      continue;
    }
    if (inSection && isMaterialSectionBoundary(text)) break;
    if (inSection) sectionBlocks.push(block);
  }

  const candidates = sectionBlocks.length ? sectionBlocks : blocks.filter((block) => looksLikeMaterialLine(block.text));
  const extracted = extractMaterials(candidates);
  if (extracted.length) return extracted;

  return blocks
    .filter((block) => looksLikeMaterialLine(block.text))
    .map((block, index) => materialFromText(block.text, block, index));
}

function looksLikeMaterialLine(text) {
  return isMaterialCandidate(text)
    && /申请表|报名表|成绩单|排名证明|英语|四六级|CET|推荐信|个人陈述|自述|简历|身份证|学生证|承诺书|获奖|论文|专利|科研|证明|证书|材料/.test(text);
}

function isMaterialSectionBoundary(text) {
  return /时间安排|日程安排|报名时间|考核安排|复试安排|面试安排|录取|联系方式|其他事项|咨询|报名方式|报名链接|招生宣传|宣传活动|报考方向|招生方向|导师名单|学院网站|微信公众号/.test(text);
}

function isMaterialCandidate(text, name = "") {
  const value = String(`${name || ""} ${text || ""}`).trim();
  if (!value) return false;
  if (isNonMaterialInstruction(value) && !hasStrongMaterialSignal(value)) return false;
  return hasStrongMaterialSignal(value) || hasUploadableMaterialSignal(value);
}

function isNonMaterialInstruction(text) {
  return /报名链接|报名网址|报名系统|报名方式|报考方向|招生方向|研究方向|学院网站|官网|微信公众号|公众号|招生宣传|宣传活动|导师名单|联系方式|咨询电话|电子邮箱|邮箱|QQ群|微信群|网址|链接|https?:\/\/|www\.|\.edu\.cn|填报信息|填写信息|根据系统要求|关注.*网站|关注.*公众号|具体安排/.test(text)
    || /(?:^|[：:])\s*https?:\/\//.test(text);
}

function hasStrongMaterialSignal(text) {
  return /申请表|报名表|成绩单|排名证明|成绩排名|英语(?:水平)?证明|四六级|CET|雅思|托福|推荐信|个人陈述|个人自述|简历|CV|身份证|学生证|承诺书|获奖证书|荣誉证书|论文|专利|科研成果|证明材料|证书|扫描件|复印件|附件|申请材料/.test(text);
}

function hasUploadableMaterialSignal(text) {
  return /(?:上传|提交|邮寄|递交|提供).{0,18}(?:材料|证明|证书|表|表格|文件|扫描件|复印件|附件)/.test(text)
    || /(?:材料|证明|证书|表|表格|文件|扫描件|复印件|附件).{0,18}(?:上传|提交|邮寄|递交|提供)/.test(text);
}

function materialFromText(text, block, index) {
  const cleaned = splitMaterialLine(text)[0] || text;
  const nameOriginal = detectMaterialName(cleaned);
  const item = {
    ordinal: index + 1,
    raw_text: cleaned,
    source_blocks: [block.id],
    name_original: nameOriginal,
    name_normalized: normalizeMaterialName(cleaned) || nameOriginal,
    is_required: detectRequired(cleaned) || "must",
    form: detectForm(cleaned),
    seal_required: detectSeals(cleaned),
    quantity: detectQuantity(cleaned),
    page_limit: detectPageLimit(cleaned),
    word_limit: detectWordLimit(cleaned),
    format_note: detectFormatNote(cleaned)
  };
  const uncertainFields = Object.entries(item)
    .filter(([key, value]) => !["ordinal", "raw_text", "source_blocks", "name_original", "name_normalized", "is_required"].includes(key) && (value === null || (Array.isArray(value) && value.length === 0)))
    .map(([key]) => key);
  item._uncertain = uncertainFields.length > 0;
  item._uncertain_fields = uncertainFields;
  return item;
}

function normalizeMaterialOrdinals(materials) {
  return dedupeBy(materials.filter(Boolean), (item) => `${item.name_normalized || item.name_original}:${item.raw_text}`)
    .map((item, index) => ({ ...item, ordinal: index + 1 }));
}

function extractTimeline(blocks, defaultYear) {
  const events = [];
  for (const block of blocks) {
    const text = block.text;
    const matches = [...text.matchAll(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}:\d{2}))?/g)];
    for (const [matchIndex, match] of matches.entries()) {
      const year = Number(match[1] || defaultYear);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const iso = year && month && day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
      events.push({
        event_type: detectEventType(text, matchIndex),
        date_raw: match[0].trim(),
        date_iso: iso,
        time_raw: match[4] || null,
        description: text,
        source_blocks: [block.id]
      });
    }
  }
  return dedupeBy(events, (event) => `${event.event_type}:${event.date_raw}:${event.description}`);
}

function splitMaterialLine(text) {
  const cleaned = text.replace(/^(\d+|[（(]?\d+[）)]?)[.、．]\s*/, "").trim();
  if (!cleaned || /申请材料|提交材料|材料清单/.test(cleaned) || !isMaterialCandidate(cleaned)) return [];
  if (/身份证复印件、学生证复印件/.test(cleaned)) {
    return ["身份证复印件。", "学生证复印件。"];
  }
  const mentions = extractMaterialMentions(cleaned);
  if (mentions.length > 1) return mentions;
  return [cleaned];
}

function extractMaterialMentions(text) {
  const names = [...GLOBAL_MATERIAL_DICT.keys()].sort((a, b) => b.length - a.length);
  const mentions = [];
  for (const name of names) {
    const index = text.indexOf(name);
    if (index < 0) continue;
    const overlaps = mentions.some((item) => index >= item.index && index < item.index + item.name.length);
    if (!overlaps) mentions.push({ name, index });
  }
  return mentions
    .sort((a, b) => a.index - b.index)
    .map((item, index, array) => {
      const next = array[index + 1]?.index ?? text.length;
      const phrase = text.slice(item.index, next).replace(/[、，和及]$/, "").trim();
      return /[。；;]/.test(phrase) ? phrase.replace(/[。；;].*$/, "。") : phrase;
    })
    .filter(Boolean);
}

function detectMaterialName(text) {
  const direct = [...GLOBAL_MATERIAL_DICT.keys()]
    .sort((a, b) => b.length - a.length)
    .find((name) => text.includes(name));
  return direct || text.replace(/[，,。；;].*$/, "").slice(0, 28);
}

function normalizeMaterialName(text) {
  const direct = [...GLOBAL_MATERIAL_DICT.keys()]
    .sort((a, b) => b.length - a.length)
    .find((name) => text.includes(name));
  return direct ? GLOBAL_MATERIAL_DICT.get(direct) : null;
}

function detectRequired(text) {
  if (/如有|可选|鼓励|可提交/.test(text)) return "optional";
  if (/如.*则需|若.*须|条件/.test(text)) return "conditional";
  if (/必须|须|应/.test(text)) return "must";
  return null;
}

function detectForm(text) {
  if (/原件扫描|原件扫描件/.test(text)) return "original_scan";
  if (/复印件/.test(text)) return "copy";
  if (/电子版|在线填写|系统生成/.test(text)) return "electronic";
  return null;
}

function detectSeals(text) {
  const seals = STRICT_SEALS.filter((seal) => text.includes(seal));
  return seals.length ? seals : null;
}

function detectQuantity(text) {
  const numeric = text.match(/(\d+)\s*(?:封|份|件|张)/);
  if (numeric) return Number(numeric[1]);
  const chinese = text.match(/([一二两三四五六七八九十])\s*(?:封|份|件|张)/);
  return chinese ? CHINESE_NUMBERS.get(chinese[1]) || null : null;
}

function detectPageLimit(text) {
  const numeric = text.match(/(?:不超过|≤|限|以内)\s*(\d+)\s*页|(\d+)\s*页(?:以内|内)/);
  if (numeric) return Number(numeric[1] || numeric[2]);
  const chinese = text.match(/(?:不超过|≤|限|以内)\s*([一二两三四五六七八九十])\s*页/);
  return chinese ? CHINESE_NUMBERS.get(chinese[1]) || null : null;
}

function detectWordLimit(text) {
  const match = text.match(/(?:不超过|≤|限|以内)\s*(\d+)\s*字|(\d+)\s*字(?:以内|内)/);
  return match ? Number(match[1] || match[2]) : null;
}

function detectFormatNote(text) {
  const notes = [];
  if (/不超过|≤|以内|限/.test(text)) notes.push(text.match(/(?:不超过|≤|限|以内)[^。；;，,]*/)?.[0] || "");
  if (/PDF|pdf|Word|word|电子版|原件扫描|复印件/.test(text)) notes.push(text.match(/(?:PDF|pdf|Word|word|电子版|原件扫描件?|复印件)/)?.[0] || "");
  return notes.filter(Boolean).join("；") || null;
}

function detectEventType(text, matchIndex = 0) {
  if (/报名时间/.test(text) && /至/.test(text) && matchIndex > 0) return "registration_close";
  if (/报名.*开始|报名时间/.test(text)) return "registration_open";
  if (/截止|至/.test(text) && /报名/.test(text)) return "registration_close";
  if (/初审|审核/.test(text)) return "review_announce";
  if (/面试|复试|考核/.test(text)) return "interview";
  if (/录取|公示/.test(text)) return "result_announce";
  return "_other";
}

function findWithSource(pattern, blocks) {
  for (const block of blocks) {
    const match = block.text.match(pattern);
    if (match) return { value: match[1], blockId: block.id };
  }
  return null;
}

function extractAfter(text, pattern) {
  const match = text.match(pattern);
  if (!match) return [];
  return match[1].split(/[、,，和及]/).map((item) => item.trim()).filter(Boolean);
}

function sourceBlocksContaining(blocks, value) {
  return blocks.filter((block) => block.text.includes(value)).map((block) => block.id);
}

function field(value, source, reasonIfNull) {
  return {
    value,
    source,
    reason_if_null: value === null ? reasonIfNull : ""
  };
}

function requirement(category, rawText, blockId) {
  return {
    category,
    raw_text: rawText,
    source_blocks: [blockId]
  };
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeBasicInfo(ruleBasicInfo, aiBasicInfo = {}, blocks) {
  const organizer = basicValue(aiBasicInfo, ["organizer", "organizer_name", "host", "department", "unit"]);
  const university = basicValue(aiBasicInfo, ["university", "school_name"]) || extractUniversityName(organizer);
  const school = basicValue(aiBasicInfo, ["school", "college", "department", "organizer", "organizer_name", "host", "unit"]);
  const programType = normalizeProgramType(basicValue(aiBasicInfo, ["program_type", "event_type", "project_type", "type"]));
  const directions = normalizeArrayValue(basicValue(aiBasicInfo, ["directions", "direction", "major_direction", "research_directions"]));
  const degreeTypes = normalizeArrayValue(basicValue(aiBasicInfo, ["degree_types", "degree_type"]));
  const eventName = basicValue(aiBasicInfo, ["event_name", "title"]);
  const eventDirection = extractDirectionFromText(eventName);

  return {
    university: university
      ? field(university, sourceForAi(aiBasicInfo, blocks), "")
      : safeRuleField(ruleBasicInfo.university, "原文未出现明确院校名称"),
    school: school
      ? field(school, sourceForAi(aiBasicInfo, blocks), "")
      : safeRuleField(ruleBasicInfo.school, "原文未出现明确学院/院系名称"),
    program_type: programType
      ? field(programType, sourceForAi(aiBasicInfo, blocks), "")
      : safeRuleField(ruleBasicInfo.program_type, "原文未出现夏令营/预推免/直推等明确项目类型"),
    directions: {
      value: directions.length ? directions : eventDirection ? [eventDirection] : ruleBasicInfo.directions?.value || [],
      source: directions.length || eventDirection ? sourceForAi(aiBasicInfo, blocks) : ruleBasicInfo.directions?.source || [],
      reason_if_empty: directions.length || eventDirection || ruleBasicInfo.directions?.value?.length ? "" : "原文未出现明确招生方向"
    },
    degree_types: {
      value: degreeTypes.length ? degreeTypes : ruleBasicInfo.degree_types?.value || [],
      source: degreeTypes.length ? sourceForAi(aiBasicInfo, blocks) : ruleBasicInfo.degree_types?.source || [],
      reason_if_empty: degreeTypes.length || ruleBasicInfo.degree_types?.value?.length ? "" : "原文未出现明确学位类型"
    }
  };
}

function normalizeAiRequirements(aiRequirements, blocks, fallback) {
  if (!Array.isArray(aiRequirements) || !aiRequirements.length) return fallback;
  return aiRequirements.map((item) => ({
    category: item.category || "其他硬性门槛",
    raw_text: item.raw_text || item.text || "",
    source_blocks: sourceForAi(item, blocks)
  })).filter((item) => item.raw_text);
}

function normalizeAiMaterials(aiMaterials, blocks, fallback) {
  if (!Array.isArray(aiMaterials) || !aiMaterials.length) return fallback;
  const materials = aiMaterials.map((item, index) => {
    const rawText = item.raw_text || item.requirement || item.text || item.name_original || item.name_normalized || "";
    const normalized = item.name_normalized || normalizeMaterialName(rawText) || item.name_original || detectMaterialName(rawText);
    const material = {
      ordinal: index + 1,
      raw_text: rawText,
      source_blocks: sourceForAi(item, blocks),
      name_original: item.name_original || detectMaterialName(rawText),
      name_normalized: normalized,
      is_required: item.is_required || detectRequired(rawText) || "must",
      form: item.form || detectForm(rawText),
      seal_required: normalizeStringArray(item.seal_required) || detectSeals(rawText),
      quantity: Number(item.quantity || detectQuantity(rawText) || 0) || null,
      page_limit: Number(item.page_limit || detectPageLimit(rawText) || 0) || null,
      word_limit: Number(item.word_limit || detectWordLimit(rawText) || 0) || null,
      format_note: item.format_note || detectFormatNote(rawText)
    };
    const uncertainFields = Object.entries(material)
      .filter(([key, value]) => !["ordinal", "raw_text", "source_blocks", "name_original", "name_normalized", "is_required"].includes(key) && (value === null || (Array.isArray(value) && value.length === 0)))
      .map(([key]) => key);
    material._uncertain = uncertainFields.length > 0;
    material._uncertain_fields = uncertainFields;
    return material;
  }).filter((item) => item.raw_text && isMaterialCandidate(item.raw_text, item.name_normalized || item.name_original));
  return materials.length ? materials : fallback;
}

function normalizeAiTimeline(aiTimeline, blocks, fallback) {
  if (!Array.isArray(aiTimeline) || !aiTimeline.length) return fallback;
  return aiTimeline.map((item) => ({
    event_type: item.event_type || "_other",
    date_raw: item.date_raw || item.date_iso || "",
    date_iso: item.date_iso || null,
    time_raw: item.time_raw || null,
    description: item.description || item.raw_text || item.date_raw || "",
    source_blocks: sourceForAi(item, blocks)
  })).filter((item) => item.description || item.date_iso);
}

function basicValue(info, keys) {
  for (const key of keys) {
    const value = info?.[key]?.value ?? info?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizeArrayValue(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[、,，;/\s]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeProgramType(value) {
  const text = String(value || "");
  if (!text) return null;
  if (/夏令营|交流营|暑期/.test(text)) return "summer_camp";
  if (/预推免|推免|推荐免试|预报名/.test(text)) return "pre_recommendation";
  if (/直博|直推/.test(text)) return "direct_admission";
  return value;
}

function extractUniversityName(value) {
  return String(value || "").match(/([\u4e00-\u9fa5]{2,20}大学)/)?.[1] || null;
}

function extractDirectionFromText(value) {
  return String(value || "").match(/[（(]([^）)]*方向)[）)]/)?.[1] || "";
}

function safeRuleField(fieldValue, reasonIfNull) {
  const value = fieldValue?.value;
  if (!value || isSuspiciousRuleValue(value)) return field(null, [], reasonIfNull);
  return fieldValue;
}

function isSuspiciousRuleValue(value) {
  return /须|加盖|公章|红章|部门|复印|扫描|证明|成绩|排名/.test(String(value || ""));
}

function sourceForAi(item, blocks) {
  const source = item?.source_blocks || item?.source || [];
  const array = Array.isArray(source) ? source : [source];
  const valid = array.map(String).filter((id) => blocks.some((block) => block.id === id));
  if (valid.length) return valid;
  const rawText = item?.raw_text || item?.text || item?.description || item?.requirement || "";
  const matched = blocks.find((block) => rawText && block.text.includes(String(rawText).slice(0, 18)));
  return matched ? [matched.id] : [blocks[0]?.id || "b001"];
}

function normalizeStringArray(value) {
  if (typeof value === "boolean") return null;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return null;
  return String(value).split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
