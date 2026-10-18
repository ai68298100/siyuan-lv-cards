(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const pre = vis().length;
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 2500));
  const all = [...document.querySelectorAll(".b3-dialog")];
  const withSettings = all.filter(d => d.textContent.includes("AI 配置"));
  const dlg = withSettings[withSettings.length - 1];
  return {
    preDialogs: pre,
    totalDialogs: all.length,
    settingsDialogs: withSettings.length,
    killRow: dlg ? dlg.textContent.includes("紧急停用") : null,
    hasAISection: dlg ? dlg.textContent.includes("AI 配置") : null,
  };
})()
