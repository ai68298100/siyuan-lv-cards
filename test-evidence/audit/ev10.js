(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const rateBtns = [...rev.querySelectorAll("button")].map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(t => /遗忘|困难|良好|简单/.test(t));
  return { flipped: rateBtns.length > 0, rateBtns, faceText: (rev.querySelector(".b3-typography, [class*=lv-card2]")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 250) };
})()
