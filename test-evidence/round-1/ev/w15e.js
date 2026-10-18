(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 关向导
  let dlg = vis()[vis().length - 1];
  if (dlg && dlg.textContent.includes("AI 制卡")) {
    [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "取消")?.click();
    await new Promise(r => setTimeout(r, 800));
  }
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  dlg = vis()[vis().length - 1];
  const resumeBtn = [...dlg.querySelectorAll("button")].find(b => /恢复|重新启用/.test(b.textContent) && !b.textContent.includes("默认") && !b.textContent.includes("全部"));
  const label = resumeBtn?.textContent?.trim();
  resumeBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  const toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 120);
  const ks = JSON.stringify(p.killSwitch);
  return { clickedLabel: label, toast, killSwitchNow: ks.slice(0, 220) };
})()
