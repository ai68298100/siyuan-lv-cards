(() => {
  const hub = document.querySelector("[class*=lv-hub]");
  const t = hub?.textContent?.replace(/\s+/g, " ") ?? "";
  return {
    hasScan: /扫描|维护队列|债务/.test(t),
    text: t.slice(0, 220),
  };
})()
