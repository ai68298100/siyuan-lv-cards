(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2000));
  const dlg = vis()[vis().length - 1];
  const revokeBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("撤销 AI 使用同意"));
  const killRow = dlg.textContent.includes("紧急停用");
  return { aiMode: p.settings.aiMode, killRowVisible: killRow, revokeBtnFound: !!revokeBtn };
})()
