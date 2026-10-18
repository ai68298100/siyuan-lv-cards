(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关向导
  for (let i = 0; i < 2; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    [...dlg.querySelectorAll("button")].filter(b => /Cancel|取消/.test(b.textContent.trim())).pop()?.click();
    await new Promise(r => setTimeout(r, 700));
  }
  // 管理器 → 点第一行开抽屉
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  const hubEl = document.querySelector("[class*=lv-hub]");
  const rows = [...hubEl().querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("示例 1") && e.getBoundingClientRect().width > 150);
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  if (!r) return { err: "row not found" };
  window.__p = { x: Math.round(r.x + Math.min(r.width / 2, 260)), y: Math.round(r.y + r.height / 2) };
  return window.__p;
})()
