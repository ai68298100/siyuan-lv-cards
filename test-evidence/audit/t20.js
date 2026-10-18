(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // 切回熟练
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  const sel = [...dlg.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "advanced"));
  sel.value = "advanced";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "确定" && b.getBoundingClientRect().width > 0).pop()?.click();
  await new Promise(r => setTimeout(r, 1200));
  // AI 撤销同意
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("撤销 AI 使用同意"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  // 可能有确认框
  const dlg2 = vis()[vis().length - 1];
  const confirmBtn = [...(dlg2?.querySelectorAll("button") ?? [])].filter(b => /撤销|确认|确定/.test(b.textContent.trim())).pop();
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 1200));
  out.revoked = p.killSwitch?.revoked;
  // 关设置
  [...(dlg2?.querySelectorAll("button") ?? [])].filter(b => b.textContent.trim() === "取消").pop()?.click();
  await new Promise(r => setTimeout(r, 800));
  // 向导生成 → 期待友好阻断文案（aiKill.consentRevoked）
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  let wdlg = vis()[vis().length - 1];
  [...(wdlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.includes("AI 生成"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  wdlg = vis()[vis().length - 1];
  [...(wdlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.includes("确认发送"))?.click();
  await new Promise(r => setTimeout(r, 2000));
  wdlg = vis()[vis().length - 1];
  const wt = wdlg?.textContent?.replace(/\s+/g, " ") ?? "";
  out.wizardBlock = wt.match(/撤销[^。]{0,50}|同意[^。]{0,50}/)?.[0] ?? null;
  out.noRawError = !wt.includes("Cannot read properties");
  // 关向导
  [...(wdlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消")?.click();
  return out;
})()
