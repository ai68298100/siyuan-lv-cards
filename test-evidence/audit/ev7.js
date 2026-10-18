(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  return {
    reviewText: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null,
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
  };
})()
