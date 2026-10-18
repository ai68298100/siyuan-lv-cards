(() => {
  const bcs = [...document.querySelectorAll(".protyle-breadcrumb")];
  const out = bcs.map(bc => {
    const all = [...bc.querySelectorAll("*")].filter(e => e.getBoundingClientRect().width > 0);
    const lv = all.filter(e => String(e.getAttribute("class") ?? "").includes("lv-") || (e.getAttribute("aria-label") ?? "").includes("复习"));
    return { totalVisible: all.length, lvItems: lv.map(e => ({ tag: e.tagName, aria: e.getAttribute("aria-label"), cls: String(e.getAttribute("class")).slice(0, 50) })), texts: all.filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean).slice(0, 10) };
  });
  return out;
})()
