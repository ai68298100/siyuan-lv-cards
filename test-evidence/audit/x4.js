(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  const rev = document.querySelector("[class*=lv-review]");
  // 第一张：翻面 → 点遗忘（元素点击 .lv-b1）
  const showBtn = rev.querySelector(".lv-btn-wide");
  showBtn?.click();
  await new Promise(r => setTimeout(r, 900));
  const forget = rev.querySelector(".lv-btn-rate.lv-b1");
  forget?.click();
  await new Promise(r => setTimeout(r, 1500));
  const t = rev.textContent.replace(/\s+/g, " ");
  const errTagRow = rev.querySelector(".lv-err-tags");
  const chips = errTagRow ? [...errTagRow.querySelectorAll("button")].map(b => b.textContent.trim()).filter(x => x && x !== "✕") : [];
  return {
    errTagRowShown: !!errTagRow,
    chips,
    prompt: errTagRow?.querySelector(".ft__smaller")?.textContent ?? null,
  };
})()
