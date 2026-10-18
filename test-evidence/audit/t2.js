(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-dashboard", { tab: "manage" });
  await new Promise(r => setTimeout(r, 2500));
  const hub = document.querySelector("[class*=lv-hub]");
  // 找空内容行（原显示裸 ID 的那张）
  const bare = [...hub.querySelectorAll("*")].filter(e => e.children.length === 0 && /20261009021640/.test(e.textContent));
  const fallback = [...hub.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.includes("空卡面"));
  return { bareIdGone: bare.length === 0, fallbackShown: fallback.length > 0, fallbackText: fallback[0]?.textContent?.slice(0, 40) ?? null };
})()
