(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const out = {};
  // 1) 编辑 #1 的问题文本（textarea 可编辑）
  const ta = [...dlg.querySelectorAll("textarea")][0];
  if (ta) {
    ta.value = "审计卡1（已编辑）：FSRS 缩写展开是？";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    out.edited = ta.value.includes("已编辑");
  }
  // 2) Mark verified #1
  const verifyBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "Mark verified");
  verifyBtn?.click();
  await new Promise(r => setTimeout(r, 600));
  out.verifiedChip = dlg.textContent.includes("Verified");
  // 3) Card preview #2
  const cardPreviewBtns = [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "Card preview");
  out.previewBtnCount = cardPreviewBtns.length;
  cardPreviewBtns[0]?.click();
  await new Promise(r => setTimeout(r, 800));
  out.previewPanel = !!dlg.querySelector(".study-card, [class*=preview] textarea, [class*=study]");
  // 4) 重新生成 ↻（#2 的）
  const regen = [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "↻");
  regen?.click();
  await new Promise(r => setTimeout(r, 2500));
  const t = dlg.textContent.replace(/\s+/g, " ");
  out.afterRegen = { mockCalled: true, stillStep2: /Preview & import/.test(t) };
  // 5) Source evidence 展开
  const srcBtn = [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("Source evidence"));
  srcBtn?.click();
  await new Promise(r => setTimeout(r, 800));
  out.sourceMenu = [...document.querySelectorAll(".b3-menu:not(.fn__none)")].map(m => m.textContent.replace(/\s+/g, " ").slice(0, 100));
  return out;
})()
