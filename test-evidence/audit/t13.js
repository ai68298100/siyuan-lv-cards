(() => {
  const hubEl = document.querySelector("[class*=lv-hub]");
  const t = hubEl.textContent.replace(/\s+/g, " ");
  return { planCreated: t.includes("审计走查考试"), examView: t.slice(0, 340) };
})()
