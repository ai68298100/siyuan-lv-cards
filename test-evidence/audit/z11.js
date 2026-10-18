(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 注入一条卡住的 reviewing 作业（材料来源指向示例卡片文档）
  const sql = await (await fetch("/api/query/sql", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json().catch(() => null);
  const job = {
    id: "job-audit-stuck",
    status: "reviewing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: "mock",
    deckID: "",
    source: { type: "doc", label: "示例卡片", preview: "审计卡材料预…" },
    candidates: [
      { q: "断点卡1：恢复流程验证？", a: "是，断点续传。", keep: true, status: "pending" },
      { q: "断点卡2：第二张验证卡。", a: "内容 B。", keep: true, status: "pending" },
    ],
  };
  p.aiJobs.jobs = [job];
  await p.persist.save("ai-jobs.json", p.aiJobs);
  // 刷新页面让向导重新加载作业
  return { injected: true };
})()
