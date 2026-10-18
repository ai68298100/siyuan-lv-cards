(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // 1) 撤销同意（英文界面：Revoke）
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Revoke"))?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.revoked = p.killSwitch?.revoked ?? null;
  // 2) 关设置，导向导生成
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "Cancel").pop()?.click();
  await new Promise(r => setTimeout(r, 800));
  await p.openAIWizard();
  await new Promise(r => setTimeout(r, 2000));
  dlg = vis()[vis().length - 1];
  // 填材料（载入当前文档或直接往 textarea 塞）
  const ta = [...dlg.querySelectorAll("textarea")].find(e => e.getBoundingClientRect().width > 100);
  if (ta) {
    ta.value = "Consent revoke test material.";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
  }
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("AI 生成") || b.textContent.includes("Generate"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => /确认发送|Confirm/.test(b.textContent))?.click();
  await new Promise(r => setTimeout(r, 2000));
  dlg = vis()[vis().length - 1];
  const wt = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  out.blockMessage = wt.match(/(revoked|consent)[^|]{0,80}/i)?.[0] ?? null;
  out.noRawError = !wt.includes("Cannot read properties");
  return out;
})()
