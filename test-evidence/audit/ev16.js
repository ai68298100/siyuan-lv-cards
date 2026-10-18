(() => {
  const content = document.querySelector(".lv-card-content");
  const mark = content?.querySelector("mark");
  if (!content || !mark) return { contentExists: !!content, markExists: !!mark };
  const cs = getComputedStyle(mark);
  const cls = content.className;
  return {
    contentClasses: cls,
    markColor: cs.color,
    markBg: cs.backgroundColor,
    markText: mark.textContent.slice(0, 30),
    maskedApplied: cls.includes("lv-masked"),
  };
})()
