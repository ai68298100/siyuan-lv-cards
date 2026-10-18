(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const hub = () => document.querySelector("[class*=lv-hub]");
  const out = {};
  // 重置 → 确认框出现 → 取消
  [...hub().querySelectorAll("button")].find(b => b.textContent.trim() === "重置")?.click();
  await new Promise(r => setTimeout(r, 1000));
  let dlg = vis()[vis().length - 1];
  out.resetConfirm = dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 140) ?? null;
  [...(dlg?.querySelectorAll("button") ?? [])].filter(b => b.textContent.trim() === "取消").pop()?.click();
  await new Promise(r => setTimeout(r, 800));
  // 取消选择，点行开详情抽屉
  [...hub().querySelectorAll("button")].find(b => b.textContent.trim() === "取消选择")?.click();
  await new Promise(r => setTimeout(r, 600));
  const rows = [...hub().querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("间隔重复（SRS）是什么") && e.getBoundingClientRect().width > 150);
  const el = rows[rows.length - 1];
  const r = el?.getBoundingClientRect();
  window.__rowPos = r ? { x: Math.round(r.x + Math.min(r.width / 2, 250)), y: Math.round(r.y + r.height / 2) } : null;
  out.rowPos = window.__rowPos;
  return out;
})()
