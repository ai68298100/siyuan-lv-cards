(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3500));
  const rev = document.querySelector("[class*=lv-review]");
  const hasTyping = !!rev.querySelector(".lv-typing input, input.b3-text-field");
  const choiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、．]/.test(b.textContent.trim())).length;
  return {
    settings: { typing: p.settings.typingEnabled, mixed: p.settings.mixedRotation },
    form: hasTyping ? "TYPING" : choiceBtns >= 3 ? "CHOICE" : "FLIP",
    progress: rev.querySelector(".lv-progress")?.textContent,
  };
})()
