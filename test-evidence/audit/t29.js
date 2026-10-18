(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 循环关闭所有对话框（最多 5 个）
  for (let i = 0; i < 5; i++) {
    const dlg = vis()[vis().length - 1];
    if (!dlg) break;
    const cancel = [...dlg.querySelectorAll("button")].filter(b => b.textContent.trim() === "取消").pop();
    if (cancel) { cancel.click(); } else { break; }
    await new Promise(r => setTimeout(r, 700));
  }
  return { remaining: vis().length };
})()
