(async () => {
  // 偏好弹层在 DOM 里找文本
  const floats = [...document.querySelectorAll("*")].filter(e => /本场偏好|时间预算/.test(e.textContent) && e.getBoundingClientRect().width > 150 && e.getBoundingClientRect().width < 700 && e.getBoundingClientRect().height < 700);
  const panel = floats[floats.length - 1];
  const out = { panelFound: !!panel, text: panel?.textContent?.replace(/\s+/g, " ")?.slice(0, 400) ?? null };
  // 切"三档"
  const three = [...(panel?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "三档");
  three?.click();
  await new Promise(r => setTimeout(r, 800));
  const rev = document.querySelector("[class*=lv-review]");
  out.afterThree = { ratingSwitch: rev.textContent.includes("三档") || rev.textContent.includes("认识"), text: rev.textContent.replace(/\s+/g, " ").match(/(四档|三档)/)?.[0] ?? null };
  // 还原
  const restore = [...(panel?.querySelectorAll("button") ?? [])].find(b => b.textContent.includes("还原全部"));
  restore?.click();
  await new Promise(r => setTimeout(r, 800));
  // 关闭弹层 ✕
  const close = [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === "✕" || b.getAttribute("aria-label") === "取消").pop();
  close?.click();
  await new Promise(r => setTimeout(r, 600));
  return out;
})()
