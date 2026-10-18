(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const rows = [...hubEl.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("示例 1") && e.getBoundingClientRect().width > 150);
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  return { pos: r ? { x: Math.round(r.x + Math.min(r.width / 2, 260)), y: Math.round(r.y + r.height / 2) } : null };
})()
