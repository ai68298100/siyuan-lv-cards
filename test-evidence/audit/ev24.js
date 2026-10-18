(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  // 找"恢复全部"（今日不学区）
  const btn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("恢复全部"));
  const out = { found: !!btn, label: btn?.textContent?.trim() };
  btn?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 100) ?? null;
  out.suspendAfter = JSON.stringify(p.suspendToday);
  // 关设置
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "取消")?.click();
  await new Promise(r => setTimeout(r, 800));
  return out;
})()
