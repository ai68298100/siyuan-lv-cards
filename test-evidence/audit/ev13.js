(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const btns = [...rev.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => ({ t: b.textContent.replace(/\s+/g, " ").trim().slice(0, 16), aria: b.getAttribute("aria-label"), x: Math.round(b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2), y: Math.round(b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2) }));
  return btns.filter(b => b.t);
})()
