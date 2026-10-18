(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  const content = document.querySelector(".lv-card-content");
  const markEl = content?.querySelector("mark, span[data-type='mark']");
  const cs = markEl ? getComputedStyle(markEl) : null;
  return {
    faceText: (content?.textContent ?? "").slice(0, 60),
    markFound: !!markEl,
    markColor: cs?.color,
    masked: content?.className?.includes("lv-masked"),
  };
})()
