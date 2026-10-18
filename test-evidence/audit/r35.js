(() => {
  const texts = [...document.querySelectorAll(".b3-list-item__text")].map(e => ({ t: e.textContent.trim().slice(0, 16), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2), w: Math.round(e.getBoundingClientRect().width) }));
  const arrows = [...document.querySelectorAll(".b3-list-item__arrow")].map(a => ({ open: (a.getAttribute("class") ?? "").includes("open"), x: Math.round(a.getBoundingClientRect().x + a.getBoundingClientRect().width / 2), y: Math.round(a.getBoundingClientRect().y + a.getBoundingClientRect().height / 2) }));
  return { texts: texts.slice(0, 10), arrows: arrows.slice(0, 5) };
})()
