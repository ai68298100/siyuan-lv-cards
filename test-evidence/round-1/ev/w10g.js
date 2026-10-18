(() => {
  const panels = [...document.querySelectorAll("*")].filter(e => /内容状态|学习记录|来源|版本/.test(e.textContent) && e.getBoundingClientRect().width > 250 && e.getBoundingClientRect().width < 700 && e.getBoundingClientRect().height > 200);
  const p = panels[panels.length - 1];
  return { drawerOpen: !!p, text: p?.textContent?.replace(/\s+/g, " ")?.slice(0, 300) ?? null };
})()
