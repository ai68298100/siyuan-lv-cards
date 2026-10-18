(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  if (vis().length > 0) return { err: "dialogs still open" };
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const dlg = vis()[vis().length - 1];
  // 滚到 AI 区块确保渲染
  dlg.scrollTop = 2000;
  await new Promise(r => setTimeout(r, 400));
  const btn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("撤销 AI 使用同意"));
  if (!btn) {
    // 滚动容器再找
    const scroller = [...dlg.querySelectorAll("*")].find(e => e.scrollHeight > e.clientHeight + 500);
    if (scroller) { scroller.scrollTop = scroller.scrollHeight; await new Promise(r => setTimeout(r, 500)); }
  }
  const btn2 = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("撤销 AI 使用同意"));
  btn2?.click();
  await new Promise(r => setTimeout(r, 1500));
  const dlg2 = vis()[vis().length - 1];
  // 确认框
  const confirm = [...(dlg2?.querySelectorAll("button") ?? [])].filter(b => /^撤销$|确定/.test(b.textContent.trim())).pop();
  confirm?.click();
  await new Promise(r => setTimeout(r, 1200));
  const out = { revoked: p.killSwitch?.revoked ?? null, events: (p.killSwitch?.events ?? []).slice(-2).map(e => e.kind) };
  // 关设置 + 关向导清理
  const d3 = vis()[vis().length - 1];
  [...(d3?.querySelectorAll("button") ?? [])].filter(b => b.textContent.trim() === "取消").pop()?.click();
  await new Promise(r => setTimeout(r, 700));
  const d4 = vis()[vis().length - 1];
  [...(d4?.querySelectorAll("button") ?? [])].filter(b => b.textContent.trim() === "取消").pop()?.click();
  return out;
})()
