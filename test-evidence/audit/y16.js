(() => {
  // hub.js tab error 后当前 tab 状态：闪卡中心还能用吗？
  const hubEl = document.querySelector("[class*=lv-hub]");
  const tabErrVisible = document.body.textContent.includes("TypeError");
  return { hubAlive: !!hubEl, hubText: hubEl?.textContent?.replace(/\s+/g, " ")?.slice(0, 100) ?? null };
})()
