(() => {
  const p = window.siyuan.ws.app.plugins[0];
  const rev = document.querySelector("[class*=lv-review]");
  const hasInput = !!rev.querySelector("input[type=text]");
  const choiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、．]/.test(b.textContent.trim())).length;
  return {
    liveSettings: { typing: p.settings.typingEnabled, choice: p.settings.choiceEnabled, mixed: p.settings.mixedRotation },
    currentForm: hasInput ? "typing" : choiceBtns >= 3 ? "choice" : "flip/other",
  };
})()
