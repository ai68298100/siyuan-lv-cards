(async () => {
  // 1) 公式渲染检查：翻回看队列里公式卡的渲染（用管理器或直接查 DOM）
  // 简化：开复习翻到公式卡截图——先检查当前 rev 是否还有卡
  const rev = document.querySelector("[class*=lv-review]");
  const math = rev?.querySelector("[data-type='inline-math'], .katex, .mathjax, img[src*=math], .b3-math");
  // 2) 原生面板可见性：barRiffCard 打开宿主闪卡面板
  const bar = document.querySelector("#barRiffCard");
  bar?.click();
  await new Promise(r => setTimeout(r, 2500));
  const hostPanel = [...document.querySelectorAll(".b3-dialog, .fullscreen")].find(e => e.textContent.includes("闪卡"));
  return {
    mathEl: math ? math.tagName + "/" + String(math.className).slice(0, 30) : null,
    hostPanelOpen: !!hostPanel,
    hostPanelText: hostPanel?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) ?? null,
  };
})()
