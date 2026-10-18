(() => {
  const hub = document.querySelector("[class*=lv-hub]");
  const texts = [...(hub?.querySelectorAll("*") ?? [])].filter(e => e.children.length === 0 && e.getBoundingClientRect().width > 100).map(e => ({ t: e.textContent.trim().slice(0, 30), x: Math.round(e.getBoundingClientRect().x + 80), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }));
  return texts.slice(0, 12);
})()
