(async () => {
  const p = window.siyuan.ws.app.plugins[0];
  if (!p.settings?.onboarded) {
    const s = { ...p.settings, onboarded: true };
    p.settings = s;
    await p.persist.save("settings.json", s);
  }
  await p.createSampleWorkspace();
  await new Promise(r => setTimeout(r, 2500));
  // 打开复习并翻面第一张 → showReschedule 触发按钮在哪？
  await p.openTabOf("lv-cards-review");
  await new Promise(r => setTimeout(r, 3000));
  const rev = document.querySelector("[class*=lv-review]");
  // 找触发快速改期的入口（工具行/卡面菜单）
  const btns = [...rev.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0).map(b => ({ t: b.textContent.trim().slice(0, 14), aria: b.getAttribute("aria-label")?.slice(0, 20) }));
  return { progress: rev.querySelector(".lv-progress")?.textContent, btns: btns.slice(0, 16) };
})()
