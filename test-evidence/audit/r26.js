(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "刷新")?.click();
  await new Promise(r => setTimeout(r, 3000));
  const hasTyping = !!rev.querySelector(".lv-typing input, input.b3-text-field");
  const choiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、．]/.test(b.textContent.trim())).length;
  return {
    form: hasTyping ? "TYPING" : choiceBtns >= 3 ? "CHOICE" : "FLIP",
    progress: rev.querySelector(".lv-progress")?.textContent,
    typingAreaHtml: rev.querySelector(".lv-typing")?.outerHTML?.slice(0, 150) ?? null,
  };
})()
