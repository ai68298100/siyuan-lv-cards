(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    restoreBanner: /恢复|上次|继续/.test(t),
    bannerText: t.match(/(继续上次|恢复会话|上次未完成)[^。]*/)?.[0] ?? null,
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
    snippet: t.slice(0, 200),
  };
})()
