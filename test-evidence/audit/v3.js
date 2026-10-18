(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const face = () => (rev.querySelector(".lv-card-content")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const marks = () => {
    const ms = [...rev.querySelectorAll(".lv-card-content mark, .lv-card-content span[data-type='mark']")];
    return ms.map(m => ({ masked: getComputedStyle(m).color.includes("0, 0, 0, 0") || getComputedStyle(m).color === "rgba(0, 0, 0, 0)", text: m.textContent.slice(0, 20) }));
  };
  const records = [];
  for (let i = 0; i < 15; i++) {
    const qText = face().slice(0, 60);
    const qMarks = marks();
    const hasInput = !!rev.querySelector(".lv-typing input");
    // 翻面
    const showBtn = [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "显示答案");
    if (showBtn) showBtn.click();
    await new Promise(r => setTimeout(r, 700));
    const aText = face().slice(0, 80);
    const aMarks = marks();
    records.push({ i: i + 1, q: qText, qMasked: qMarks.every(m => m.masked), qMarkCount: qMarks.length, a: aText.slice(0, 60) });
    // 评分 良好
    const good = [...rev.querySelectorAll("button")].find(b => b.textContent.trim().startsWith("良好"));
    if (good) good.click();
    await new Promise(r => setTimeout(r, 900));
    if (/本场完成|没有到期/.test(rev.textContent)) break;
  }
  return records;
})()
