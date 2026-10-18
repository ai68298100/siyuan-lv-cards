(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关配对
  let dlg = vis()[vis().length - 1];
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "退出")?.click();
  await new Promise(r => setTimeout(r, 800));
  // 开管理页签
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  // 点第一行卡内容
  const rows = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("间隔重复（SRS）是什么") && e.getBoundingClientRect().width > 150);
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  return { rowFound: !!el, x: r ? Math.round(r.x + Math.min(r.width / 2, 250)) : null, y: r ? Math.round(r.y + r.height / 2) : null };
})()
