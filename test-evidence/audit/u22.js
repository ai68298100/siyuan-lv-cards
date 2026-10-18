(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    restoreHint: t.match(/(继续|恢复|上次)[^。]{0,40}/)?.[0] ?? null,
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
    reviewedStat: t.match(/复习 \d+ · 遗忘 \d+/)?.[0] ?? null,
  };
})()
