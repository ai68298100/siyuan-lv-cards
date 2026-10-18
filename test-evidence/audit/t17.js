(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  p.examPlans = {
    version: 1,
    plans: [{
      id: "audit-exam-1",
      name: "审计走查考试",
      examDate: "2026-10-23",
      scopeKind: "deck",
      scopeId: "20261009021640-q6z0fc7",
      scopeName: "示例卡组",
      cramDays: 7,
      enabled: true,
      createdAt: Date.now(),
    }],
  };
  await p.persist.save("exam-plans.json", p.examPlans);
  return { saved: p.examPlans.plans.length };
})()
