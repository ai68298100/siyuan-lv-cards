(async () => {
  const rev = document.querySelector("[class*=lv-review]");
  const out = {};
  [...rev.querySelectorAll("button, [role=button], span")].find(b => b.textContent.trim() === "缩小范围")?.click();
  await new Promise(r => setTimeout(r, 1000));
  const t = rev.textContent.replace(/\s+/g, " ");
  out.impactShown = /影响|到期|历史/.test(t.slice(t.indexOf("缩小范围"), t.indexOf("缩小范围") + 200));
  out.impactText = t.slice(t.indexOf("负荷重"), t.indexOf("负荷重") + 260);
  // 知道了关闭
  [...rev.querySelectorAll("button")].find(b => b.textContent.trim() === "知道了")?.click();
  await new Promise(r => setTimeout(r, 800));
  out.bannerClosed = !rev.textContent.includes("长期返场检查");
  return out;
})()
