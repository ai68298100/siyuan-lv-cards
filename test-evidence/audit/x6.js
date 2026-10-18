(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const forget = rev.querySelector(".lv-btn-rate.lv-b1");
  forget?.click();
  await new Promise(r => setTimeout(r, 1800));
  const row = rev.querySelector(".lv-err-tags");
  const chips = row ? [...row.querySelectorAll(".lv-err-tag")].map(b => b.textContent.trim()) : [];
  // 点选一个原因
  chips[0] && [...row.querySelectorAll(".lv-err-tag")].find(b => b.textContent.trim() === chips[0])?.click();
  await new Promise(r => setTimeout(r, 800));
  const tagged = !rev.querySelector(".lv-err-tags");
  return { rowShown: !!row, chips, tagSavedAndHidden: tagged };
})()
