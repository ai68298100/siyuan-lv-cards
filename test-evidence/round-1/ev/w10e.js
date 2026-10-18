(() => {
  const drawer = [...document.querySelectorAll("*")].filter(e => /内容状态/.test(e.textContent) && e.textContent.length < 800 && e.getBoundingClientRect().width > 200);
  const panel = drawer[drawer.length - 1];
  return { found: !!panel, text: panel?.textContent?.replace(/\s+/g, " ")?.slice(0, 260) ?? null };
})()
