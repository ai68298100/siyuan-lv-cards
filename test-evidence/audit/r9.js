(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  if (![...vis()].some(d => d.textContent.includes("设置"))) {
    await p.openSettingsDialog();
    await new Promise(r => setTimeout(r, 1800));
  }
  let dlg = vis()[vis().length - 1];
  const out = {};
  // 1) 数字输入：每日新卡目标
  const num = [...dlg.querySelectorAll("input[type=number]")].filter(e => e.getBoundingClientRect().width > 0)[0];
  if (num) {
    const before = num.value;
    num.value = "33";
    num.dispatchEvent(new Event("input", { bubbles: true }));
    num.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "确定")?.click();
    await new Promise(r => setTimeout(r, 1200));
    out.numberInput = { before, saved: p.settings?.dailyNewTarget };
    await p.openSettingsDialog();
    await new Promise(r => setTimeout(r, 1800));
    dlg = vis()[vis().length - 1];
    const num2 = [...dlg.querySelectorAll("input[type=number]")].filter(e => e.getBoundingClientRect().width > 0)[0];
    out.numberInput.persisted = num2?.value;
    num2.value = "20";
    num2.dispatchEvent(new Event("input", { bubbles: true }));
    num2.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
  }
  // 2) 画像应用：点"卡片笔记"
  const persona = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("卡片笔记"));
  persona?.click();
  await new Promise(r => setTimeout(r, 1200));
  // 确认对话框（可能是第二个 dialog 或 confirmDialog）
  const dlg2 = vis()[vis().length - 1];
  out.personaConfirm = {
    text: dlg2?.textContent?.replace(/\s+/g, " ")?.slice(0, 300) ?? null,
  };
  return out;
})()
