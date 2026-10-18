(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openQuickCard();
  await new Promise(r => setTimeout(r, 1800));
  let dlg = vis()[vis().length - 1];
  // 填问题/答案
  const inputs = [...dlg.querySelectorAll("textarea, input[type=text]")].filter(e => e.getBoundingClientRect().width > 60);
  const out = { fields: inputs.length };
  if (inputs.length >= 2) {
    inputs[0].value = "走查问题：快速制卡修复验证？";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    inputs[1].value = "是。3.8.6 事务响应已兼容。";
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    // 选卡组（下拉）→ 制卡
    const sel = [...dlg.querySelectorAll("select")].find(s => s.getBoundingClientRect().width > 60);
    if (sel) {
      const opt = [...sel.options].find(o => o.textContent.includes("示例卡组"));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    await new Promise(r => setTimeout(r, 400));
    const mk = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("制卡"));
    mk?.click();
    await new Promise(r => setTimeout(r, 3000));
    out.toast = document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 150) ?? null;
    out.dialogClosed = ![...vis()].some(d => d.textContent.includes("快速制卡"));
  }
  return out;
})()
