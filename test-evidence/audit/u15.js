(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.trim() === "退出")?.click();
  await new Promise(r => setTimeout(r, 800));
  const p = window.siyuan.ws.app.plugins[0];
  const cmd = p.commands?.find(c => c.langKey === "challenge");
  await cmd?.callback?.();
  await new Promise(r => setTimeout(r, 1500));
  dlg = vis()[0];
  [...dlg.querySelectorAll("button")].find(b => b.textContent.includes("开始挑战"))?.click();
  await new Promise(r => setTimeout(r, 2500));
  dlg = vis()[0];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return { challengeRunning: /挑战|进行中|\d+ \/ \d+/.test(t), text: t.slice(0, 220) };
})()
