(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  const dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "测试连接")?.click();
  await new Promise(r => setTimeout(r, 5000));
  // ankiLabel 渲染在按钮行内（ft__smaller span）
  const label = [...dlg.querySelectorAll(".ft__smaller")].map(e => e.textContent.trim()).filter(Boolean);
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "取消")?.click();
  return { inlineLabel: label };
})()
