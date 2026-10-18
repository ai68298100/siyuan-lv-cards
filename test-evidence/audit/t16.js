(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard", { tab: "exam" });
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const t = hubEl.textContent.replace(/\s+/g, " ");
  return {
    planShown: t.includes("审计走查考试"),
    daily: t.match(/每天[^，。 ]{0,16}/g)?.slice(0, 3) ?? null,
    cram: /cram/i.test(t),
    view: t.slice(0, 280),
  };
})()
