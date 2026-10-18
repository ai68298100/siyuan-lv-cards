(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  // 先翻一页（reviewedIDs++），再手动 emit，再翻一页看 form
  const rev = document.querySelector("[class*=lv-review]");
  p.eventBus.emit("lv-cards:settings-changed", { plugin: "lv-cards", v: 1, ts: Date.now() });
  await new Promise(r => setTimeout(r, 800));
  const rev2 = document.querySelector("[class*=lv-review]");
  const hasTyping = !!rev2.querySelector(".lv-typing input, input.b3-text-field");
  const choiceBtns = [...rev2.querySelectorAll("button")].filter(b => /^[ABCD][\.、．]/.test(b.textContent.trim())).length;
  const t = rev2.textContent.replace(/\s+/g, " ");
  return {
    emitted: true,
    form: hasTyping ? "TYPING" : choiceBtns >= 3 ? "CHOICE" : t.includes("显示答案") ? "FLIP" : "?",
    progress: rev2.querySelector(".lv-progress")?.textContent,
    note: "turn=progress分子-1; mixed=true: cycle=[flip,choice,typing]",
  };
})()
