(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  const all = dlg.textContent;
  return {
    hasRevoke: all.includes("撤销 AI 使用同意"),
    hasKill: all.includes("紧急停用"),
    hasAISection: all.includes("AI 配置"),
    dialogHeights: vis().map(d => d.scrollHeight),
    revokeBtns: [...dlg.querySelectorAll("button")].filter(b => b.textContent.includes("撤销")).map(b => b.textContent.trim()),
  };
})()
