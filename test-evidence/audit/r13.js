(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // C-2 验证：画像确认框标题
  await p.openSettingsDialog();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("卡片笔记"))?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  out.personaTitleFixed = dlg?.textContent?.match(/应用画像预设 [^：]*/) ?? null;
  out.noUndefined = !dlg?.textContent.includes("undefined");
  // 取消
  [...(dlg.querySelectorAll("button") ?? [])].filter(b => b.textContent.trim() === "取消").pop()?.click();
  await new Promise(r => setTimeout(r, 800));
  // 启用练习模式：打字/选择/混合轮换（UI 开关）
  const sws = [...dlg.querySelectorAll("input.b3-switch")].filter(e => e.getBoundingClientRect().width > 0);
  // 18=打字 19=选择 20=混合（上轮索引）
  for (const i of [18, 19, 20]) {
    if (sws[i] && !sws[i].checked) sws[i].click();
    await new Promise(r => setTimeout(r, 300));
  }
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.modes = { typing: p.settings?.typingEnabled, choice: p.settings?.choiceEnabled, mixed: p.settings?.mixedRotation };
  return out;
})()
