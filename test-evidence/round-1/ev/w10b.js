(() => {
  const mgr = document.querySelector("[class*=lv-manager], [class*=lv-hub]");
  const rows = document.querySelectorAll(".b3-list-item, [class*=row]").length;
  const searchText = [...document.querySelectorAll("input")].filter(i => i.getBoundingClientRect().width > 0).map(i => i.placeholder).filter(Boolean).slice(0, 4);
  return { managerText: mgr?.textContent?.replace(/\s+/g, " ")?.slice(0, 180) ?? null, rows, searchText };
})()
