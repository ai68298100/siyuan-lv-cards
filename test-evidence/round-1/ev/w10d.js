(() => {
  const drawer = document.querySelector("[class*=drawer], [class*=lv-detail], .b3-dialog--drawer");
  const all = [...document.querySelectorAll("*")].filter(e => /内容状态|开档记录|学习记录/.test(e.textContent) && e.getBoundingClientRect().height > 50 && e.getBoundingClientRect().height < 900);
  const el = all[all.length - 1];
  return { drawerVisible: !!drawer, detailText: el?.textContent?.replace(/\s+/g, " ")?.slice(0, 250) ?? null };
})()
