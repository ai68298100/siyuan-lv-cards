(() => {
  const dlg = document.querySelector(".b3-dialog");
  const lis = [...dlg.querySelectorAll("li, .b3-list-item, [class*=row], [class*=item]")].slice(0, 12).map(e => ({ tag: e.tagName, cls: String(e.className).slice(0, 40), text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 20) }));
  return lis;
})()
