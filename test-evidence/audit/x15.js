(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const t = rev.textContent.replace(/\s+/g, " ");
  const btns = [...rev.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => b.textContent.trim());
  return {
    doneScreen: /本场完成/.test(t),
    undoLastBtn: btns.includes("撤销最后一评"),
    againBtn: btns.includes("再来一批"),
    reasonChips: btns.filter(b => /精力不足|时间到了|手动结束|有疑问|目标完成/.test(b)).slice(0, 5),
    text: t.slice(0, 150),
  };
})()
