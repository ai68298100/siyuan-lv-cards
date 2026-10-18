(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev.textContent.replace(/\s+/g, " ");
  // 遗忘后原因 chips
  const chips = [...rev.querySelectorAll("button, [role=button], .lv-chip2")].map(e => e.textContent.trim()).filter(x => /概念|混淆|记错|干扰|太长|太短|句子|其他|忘了/.test(x));
  return {
    forgetTagged: chips.length > 0,
    chips: chips.slice(0, 10),
    snippet: t.slice(0, 160),
  };
})()
