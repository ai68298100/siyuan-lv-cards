(async () => {
  const rev = () => document.querySelector("[class*=lv-review]");
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // 跳过
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "跳过")?.click();
  await new Promise(r => setTimeout(r, 1500));
  out.afterSkip = { text: rev().textContent.replace(/\s+/g, " ").slice(0, 100) };
  // 上下文（来源面板）
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "上下文")?.click();
  await new Promise(r => setTimeout(r, 1500));
  let dlg = vis()[vis().length - 1];
  out.context = { dialogOpen: !!dlg && !dlg.textContent.includes("AI 制卡"), text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 140) ?? null };
  // 关闭上下文
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => /关闭|×/.test(b.textContent))?.click() ?? dlg?.querySelector(".b3-dialog__close")?.click();
  await new Promise(r => setTimeout(r, 800));
  // 偏好弹层
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "偏好")?.click();
  await new Promise(r => setTimeout(r, 1200));
  dlg = vis()[vis().length - 1];
  out.prefs = { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 260) ?? null };
  // 关闭偏好
  const closeBtn = [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消" || b.textContent.trim() === "关闭" || b.textContent.trim() === "完成");
  closeBtn?.click();
  await new Promise(r => setTimeout(r, 800));
  return out;
})()
