(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  // 点 #1 的 ↻ 重新生成 → deny 阻断应显示
  const regen = [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "↻");
  regen?.click();
  await new Promise(r => setTimeout(r, 2500));
  const t = dlg.textContent.replace(/\s+/g, " ");
  return {
    deniedMsg: /禁止外发|denied|不能发送|不过发送/i.test(t) ? t.match(/(禁止[^。]{0,50}|[Dd]enied[^|]{0,50})/)?.[0] : null,
    stillStep2: /Preview & import|预览与落库/.test(t),
    snippet: t.slice(0, 160),
  };
})()
