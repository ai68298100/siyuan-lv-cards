(() => {
  const rev = document.querySelector("[class*=lv-review]");
  const entry = [...document.querySelectorAll("[class*=lv-review] *")].filter(e => /返回|本文档|来源/.test(e.textContent) && e.getBoundingClientRect().height < 60 && e.getBoundingClientRect().height > 10);
  return {
    reviewOpen: !!rev,
    progress: rev?.querySelector(".lv-progress")?.textContent ?? null,
    entryBar: entry[entry.length - 1]?.textContent?.replace(/\s+/g, " ")?.slice(0, 80) ?? null,
  };
})()
