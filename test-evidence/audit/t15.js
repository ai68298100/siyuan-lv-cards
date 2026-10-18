(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 按 exam.ts 的 schema 注入一个计划
  const plan = {
    id: "audit-exam-1",
    name: "审计走查考试",
    deadline: "2026-10-23",
    scopeKind: "deck",
    scopeId: "20261009021640-q6z0fc7",
    scopeTotal: undefined,
    cramDays: 7,
    createdAt: Date.now(),
  };
  p.examPlans = { version: 1, plans: [plan] };
  await p.persist.save("exam-plans.json", p.examPlans);
  await p.openTabOf("lv-cards-dashboard", { tab: "exam" });
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const t = hubEl.textContent.replace(/\s+/g, " ");
  return {
    planShown: t.includes("审计走查考试"),
    dailyHint: t.match(/每天[^，。]{0,20}/)?.[0] ?? null,
    cramHint: /cram/i.test(t),
    view: t.slice(0, 300),
  };
})()
