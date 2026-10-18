(async () => {
  const sel = document.querySelector(".lv-scope");
  if (!sel) return { err: "scope select not found", reviewVisible: !!document.querySelector("[class*=lv-review]") };
  const deckOpt = [...sel.options].find(o => /^deck:/.test(o.value));
  if (!deckOpt) return { err: "no deck option", options: [...sel.options].map(o => o.value + ":" + o.textContent.trim()) };
  sel.value = deckOpt.value;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 2500));
  const rev = document.querySelector("[class*=lv-review]");
  return { selected: deckOpt.value, reviewText: rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 200) };
})()
