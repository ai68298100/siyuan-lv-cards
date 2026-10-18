(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  if (![...vis()].some(d => d.textContent.includes("设置"))) {
    await p.openSettingsDialog();
    await new Promise(r => setTimeout(r, 1800));
  }
  let dlg = vis()[vis().length - 1];
  const out = {};
  // 1) 测试连接（未配置）
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "测试连接")?.click();
  await new Promise(r => setTimeout(r, 2500));
  out.testConn = { toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null };
  // 2) 下拉：找语言/字号类下拉并读取选项
  const sels = [...dlg.querySelectorAll("select")].filter(e => e.getBoundingClientRect().width > 0);
  out.selects = sels.map(s => ({ opts: [...s.options].map(o => o.textContent.trim()).slice(0, 6), value: s.value }));
  // 3) 清空复习日志的确认框
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "清空复习日志")?.click();
  await new Promise(r => setTimeout(r, 1000));
  let dlg2 = vis()[vis().length - 1];
  out.clearConfirm = { text: dlg2?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null };
  // 取消确认框 + 取消设置
  const cancelBtns = [...(dlg2?.querySelectorAll("button") ?? [])].filter(b => b.textContent.trim() === "取消");
  cancelBtns[cancelBtns.length - 1]?.click();
  await new Promise(r => setTimeout(r, 600));
  dlg = vis()[vis().length - 1];
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消")?.click();
  return out;
})()
