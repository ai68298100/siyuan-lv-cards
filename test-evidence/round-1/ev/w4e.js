(() => {
  const texts = [...document.querySelectorAll(".b3-list-item__text")].map(e => e.textContent.trim());
  const arrows = [...document.querySelectorAll(".b3-list-item__arrow")].map(a => ({ open: (a.getAttribute("class") ?? "").includes("open"), y: Math.round(a.getBoundingClientRect().y + a.getBoundingClientRect().height / 2) }));
  return { texts: texts.slice(0, 15), arrows };
})()
