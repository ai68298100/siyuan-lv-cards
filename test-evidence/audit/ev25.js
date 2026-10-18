(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = () => document.querySelector("[class*=lv-review]");
  const rateAll = async () => {
    for (let i = 0; i < 4; i++) {
      const t = rev().textContent;
      if (/完成|收工|明日|不错/.test(t)) return "done";
      if (!/显示答案/.test(t)) return "unknown:" + t.slice(0, 60);
      const el = rev().querySelector("[class*=lv-card2], .b3-typography");
      const r = el?.getBoundingClientRect();
      if (!r) return "no-card";
      return r;
    }
  };
  // 卡1：翻面+评分3
  let r = await rateAll();
  window.__rect = r;
  return { rect: r };
})()
