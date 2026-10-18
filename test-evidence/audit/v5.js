(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  // 跳过引导
  const skip = [...vis()[0].querySelectorAll("button")].find(b => b.textContent.trim() === "Skip");
  skip?.click();
  await new Promise(r => setTimeout(r, 1000));
  const rev = document.querySelector("[class*=lv-review]");
  const records = [];
  for (let i = 0; i < 15; i++) {
    const qFace = rev.querySelector(".lv-card-content");
    const qText = (qFace?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 46);
    const qMarks = [...(qFace?.querySelectorAll("mark, span[data-type='mark']") ?? [])];
    const qMaskedAll = qMarks.length > 0 && qMarks.every(m => getComputedStyle(m).color === "rgba(0, 0, 0, 0)");
    // 翻面：主按钮 class lv-btn-wide
    const showBtn = rev.querySelector(".lv-btn-wide");
    showBtn?.click();
    await new Promise(r => setTimeout(r, 900));
    const aFace = rev.querySelector(".lv-card-content");
    const aMarks = [...(aFace?.querySelectorAll("mark, span[data-type='mark']") ?? [])];
    const aVisibleAll = aMarks.length > 0 && aMarks.every(m => getComputedStyle(m).color !== "rgba(0, 0, 0, 0)");
    const hasFormula = !!aFace?.querySelector(".katex, .MathJax, [class*=math]");
    const hasCode = !!aFace?.querySelector("code, pre");
    const hasTable = !!aFace?.querySelector("table");
    const hasList = !!aFace?.querySelector("ul, ol");
    records.push({ n: i + 1, q: qText, qMaskedAll, aUnmaskedAll: aVisibleAll, formula: hasFormula, code: hasCode, table: hasTable, list: hasList });
    // 评分良好（lv-b3）
    const good = rev.querySelector(".lv-btn-rate.lv-b3");
    good?.click();
    await new Promise(r => setTimeout(r, 1000));
    if (/done|no due|没有到期/.test(rev.textContent)) break;
  }
  return records;
})()
