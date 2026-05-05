export function matchMaterials(application, documents) {
  const schoolKey = application.basicInfo?.university?.value || "";
  const applicationDocs = application.documents || [];
  const allDocs = [...documents, ...applicationDocs];
  const availableDocs = [
    ...documents.filter((doc) => doc.scope === "global" || doc.schoolKey === schoolKey),
    ...applicationDocs
  ];
  const linkedDocs = application.materialLinks || {};
  const matches = application.materials.map((requirement) => {
    const explicitDoc = allDocs.find((doc) => doc.id === linkedDocs[String(requirement.ordinal)]);
    return matchOne(requirement, explicitDoc ? [explicitDoc] : availableDocs);
  });
  const blocking = matches.filter((item) => item.requirement.is_required !== "optional");
  const ready = blocking.filter((item) => item.state === "ready").length;
  const total = blocking.length;
  const missing = blocking.filter((item) => item.state === "missing").length;
  const needsFix = blocking.filter((item) => item.state === "needs_fix").length;

  return {
    schoolKey,
    ready,
    total,
    missing,
    needsFix,
    percent: total ? Math.round((ready / total) * 100) : 0,
    state: missing > 0 || needsFix > 0 ? "待补充" : "可导出",
    items: matches
  };
}

function matchOne(requirement, documents) {
  const normalized = requirement.name_normalized;
  const candidates = normalized
    ? documents.filter((doc) => doc.normalizedName === normalized)
    : documents.filter((doc) => requirement.raw_text.includes(doc.name) || requirement.name_original.includes(doc.name));

  if (!candidates.length) {
    if (requirement.is_required === "optional") {
      return {
        requirement,
        documents: [],
        state: "optional",
        emoji: "⚪",
        label: "可选未提交",
        issues: ["原文表述为可选材料，可在有相关成果时补充。"],
        actions: ["如有对应材料，可在当前申请中上传；没有则不阻塞导出。"]
      };
    }
    return {
      requirement,
      documents: [],
      state: "missing",
      emoji: "🔴",
      label: "缺失",
      issues: ["未在档案柜中找到匹配材料。"],
      actions: [buildMissingAction(requirement)]
    };
  }

  const docCount = candidates.reduce((sum, doc) => sum + (doc.copyCount || 1), 0);
  const issues = [];
  const actions = [];

  if (requirement.seal_required) {
    for (const seal of requirement.seal_required) {
      const hasSeal = candidates.some((doc) => doc.detectedSeals?.includes(seal));
      if (!hasSeal) {
        issues.push(`缺 ${seal}`);
        actions.push(`请补充带有「${seal}」的版本后重新上传。`);
      }
    }
  }

  if (requirement.page_limit) {
    for (const doc of candidates) {
      if ((doc.pageCount || 0) > requirement.page_limit) {
        issues.push(`${doc.name} 超出 ${requirement.page_limit} 页限制`);
        actions.push(`请将「${doc.name}」压缩到 ${requirement.page_limit} 页以内。`);
      }
    }
  }

  if (requirement.word_limit) {
    for (const doc of candidates) {
      if ((doc.wordCount || 0) > requirement.word_limit) {
        issues.push(`${doc.name} 超出 ${requirement.word_limit} 字限制`);
        actions.push(`请将「${doc.name}」删改到 ${requirement.word_limit} 字以内。`);
      }
    }
  }

  if (requirement.quantity && docCount < requirement.quantity) {
    issues.push(`仅 ${docCount} 份 / 需 ${requirement.quantity} 份`);
    actions.push(`请再补充 ${requirement.quantity - docCount} 份「${requirement.name_normalized || requirement.name_original}」。`);
  }

  if (requirement.form) {
    for (const doc of candidates) {
      if (requirement.form === "original_scan" && doc.form !== "original_scan") {
        issues.push(`${doc.name} 需原件扫描`);
        actions.push(`请上传「${doc.name}」的原件扫描件版本。`);
      }
    }
  }

  if (issues.length) {
    return {
      requirement,
      documents: candidates,
      state: "needs_fix",
      emoji: "🟡",
      label: "需补充或修改",
      issues,
      actions
    };
  }

  return {
    requirement,
    documents: candidates,
    state: "ready",
    emoji: "🟢",
    label: "已就绪",
    issues: [],
    actions: ["材料已匹配，可进入导出清单。"]
  };
}

function buildMissingAction(requirement) {
  const name = requirement.name_normalized || requirement.name_original || "该材料";
  if (requirement.seal_required?.length) {
    return `请准备「${name}」，并确认包含 ${requirement.seal_required.join("、")} 后上传。`;
  }
  if (requirement.form === "original_scan") return `请上传「${name}」原件扫描件。`;
  if (requirement.form === "copy") return `请上传「${name}」复印件或扫描版。`;
  return `请按原文要求准备并上传「${name}」。工作台上传只会绑定当前申请。`;
}
