(() => {
  const btn = [...document.querySelectorAll(".protyle-breadcrumb button")].find(b => (b.getAttribute("aria-label") ?? "").includes("复习本文档"));
  const r = btn.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()
