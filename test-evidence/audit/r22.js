(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const hasInput = !!rev.querySelector("input[type=text]");
  const choiceBtns = [...rev.querySelectorAll("button")].filter(b => /^[ABCD][\.、]/.test(b.textContent.trim())).length;
  const t = rev.textContent.replace(/\s+/g, " ");
  return { form: hasInput ? "typing" : choiceBtns >= 3 ? "choice" : "flip", choiceBtns, hasInput, snippet: t.slice(0, 150) };
})()
