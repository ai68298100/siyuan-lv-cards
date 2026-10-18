(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const hasTyping = !!rev.querySelector(".lv-typing input, input.b3-text-field");
  const choiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、．]/.test(b.textContent.trim())).length;
  const t = rev.textContent.replace(/\s+/g, " ");
  return { form: hasTyping ? "TYPING" : choiceBtns >= 3 ? "CHOICE(" + choiceBtns + ")" : t.includes("本场完成") ? "DONE" : /显示答案/.test(t) ? "flip" : "?", progress: rev.querySelector(".lv-progress")?.textContent };
})()
