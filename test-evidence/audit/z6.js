(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const t = dlg.textContent.replace(/\s+/g, " ");
  // BU-5 六类拒答判定的 UI 呈现（ai-refusal 相关 chips/说明）
  return {
    refusalClassified: /无法根据|超出.*知识|材料.*不足以|not.*JSON|invalid/i.test(t),
    snippet: t.slice(0, 300),
  };
})()
