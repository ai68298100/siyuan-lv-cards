(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  const btn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("紧急停用当前配置"));
  btn?.click();
  await new Promise(r => setTimeout(r, 1500));
  const toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 160);
  // 可能有确认对话框
  dlg = vis()[vis().length - 1];
  const confirmBtn = [...dlg.querySelectorAll("button")].find(b => /^确认|确定|停用$/.test(b.textContent.replace(/\s+/g, "")));
  let confirmed = false;
  if (confirmBtn && !confirmBtn.textContent.includes("紧急停用")) { confirmBtn.click(); confirmed = true; await new Promise(r => setTimeout(r, 1200)); }
  const p = window.siyuan.ws.app.plugins[0];
  return { toast, confirmClicked: confirmed, killSwitch: JSON.stringify(p.killSwitch).slice(0, 300) };
})()
