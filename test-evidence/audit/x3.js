(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const out = {};
  // 答案态：点"遗忘"→ 出现错误原因 chips 行（元素点击）
  const forgetBtn = rev.querySelector(".lv-btn-rate.lv-b1");
  forgetBtn?.click();
  await new Promise(r => setTimeout(r, 1500));
  const t = rev.textContent.replace(/\s+/g, " ");
  // 七类原因 chips（BJ-4：error-tags）
  const chips = [...rev.querySelectorAll("button, [role=button], .lv-chip2, .b3-chip")].map(e => e.textContent.trim()).filter(x => /概念|混淆|记错|线索|干扰|超长|拼写|其他|忘了|想不起/.test(x));
  out.chipsFound = chips.length > 0;
  out.chips = chips.slice(0, 10);
  out.requeued = /本批|重现|再来/.test(t) || rev.textContent.includes("示例");
  out.snippet = t.slice(0, 180);
  return out;
})()
