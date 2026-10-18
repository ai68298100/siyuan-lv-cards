(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const state0 = rev?.textContent?.replace(/\s+/g, " ")?.slice(0, 80) ?? "NO-REVIEW";
  const btn = [...(rev?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "编辑");
  btn?.click();
  await new Promise(r => setTimeout(r, 3000));
  const protyles = [...document.querySelectorAll(".protyle-title")].map(e => e.textContent.trim().slice(0, 20));
  const activeTitle = document.querySelector(".layout-tab-container .item--focus")?.textContent?.trim().slice(0, 20) ?? null;
  return { state0, editBtnFound: !!btn, protyles, activeTitle };
})()
