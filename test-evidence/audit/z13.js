(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  for (let i = 0; i < 2; i++) {
    const d = vis()[vis().length - 1];
    if (!d) break;
    [...d.querySelectorAll("button")].filter(b => /Cancel|取消/.test(b.textContent.trim())).pop()?.click();
    await new Promise(r => setTimeout(r, 600));
  }
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const dlg = vis()[vis().length - 1];
  // 滚到底找备份导出
  const scroller = [...dlg.querySelectorAll("*")].find(e => e.scrollHeight > e.clientHeight + 500);
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  await new Promise(r => setTimeout(r, 500));
  const btns = [...dlg.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim());
  const backupBtn = [...dlg.querySelectorAll("button")].find(b => /Export backup|导出备份|备份/.test(b.textContent) && b.getBoundingClientRect().width > 0);
  const out = { backupBtns: btns.filter(t => /备份|Backup|Export/.test(t)).slice(0, 6) };
  if (backupBtn) {
    backupBtn.click();
    await new Promise(r => setTimeout(r, 2000));
    out.toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 130) ?? null;
    // 检查是否触发下载（headless 下 Blob 下载可能静默）——查设置面板是否出现预览确认框
    const dlg2 = vis()[vis().length - 1];
    out.dialogAfter = dlg2 !== dlg ? dlg2.textContent.replace(/\s+/g, " ").slice(0, 120) : "no new dialog";
  }
  // 关设置
  [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "Cancel" || b.textContent.trim() === "取消").pop()?.click();
  return out;
})()
