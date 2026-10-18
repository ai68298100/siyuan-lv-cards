(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    returnCheckBanner: /返场|长期没学|检查/.test(t),
    bannerText: t.match(/返场[^领]{0,80}/)?.[0] ?? null,
    reliefRow: /减负/.test(t),
    snippet: t.slice(0, 200),
  };
})()
