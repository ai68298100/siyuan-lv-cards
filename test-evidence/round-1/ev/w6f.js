(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const sel = document.querySelector(".lv-scope");
  const rev = document.querySelector("[class*=lv-review]");
  return {
    scopeValue: sel?.value ?? null,
    reviewText: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 300),
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
  };
})()
