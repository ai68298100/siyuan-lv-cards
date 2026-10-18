(() => {
  const selects = [...document.querySelectorAll("select")].map(s => ({ cls: String(s.className), opts: [...s.options].map(o => o.value).slice(0, 8) }));
  const rev = document.querySelector("[class*=lv-review]");
  const headText = rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 120);
  return { selects, headText };
})()
