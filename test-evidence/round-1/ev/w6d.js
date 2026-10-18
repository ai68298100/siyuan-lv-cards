(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review", { scope: "deck:20261008215118-jxq4uxs" });
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  const sel = document.querySelector(".lv-scope");
  return {
    reviewText: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 260),
    scopeValue: sel?.value ?? null,
    hasCard: !!document.querySelector("[class*=lv-review] .b3-typography, [class*=lv-review] [data-node-id]"),
  };
})()
