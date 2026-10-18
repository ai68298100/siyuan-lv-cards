(() => {
  const bc = document.querySelector(".protyle-breadcrumb");
  const items = bc ? [...bc.querySelectorAll("*")].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ aria: e.getAttribute("aria-label"), cls: String(e.className).slice(0, 30), text: e.textContent.trim().slice(0, 12) })) : null;
  constShallow = null;
  return { bcExists: !!bc, items: items?.slice(-8) };
})()
