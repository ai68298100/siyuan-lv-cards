(async () => {
  const rev = () => document.querySelector("[class*=lv-review]");
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const out = {};
  // 编辑按钮（aria 无标签，取文本"编辑"）
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "编辑")?.click();
  await new Promise(r => setTimeout(r, 2000));
  let dlg = vis()[vis().length - 1];
  out.editor = { open: !!dlg, text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null };
  // 关闭编辑器（取消/Esc）
  [...(dlg?.querySelectorAll("button") ?? [])].find(b => b.textContent.trim() === "取消")?.click();
  await new Promise(r => setTimeout(r, 1000));
  // 暂停（今天不学）
  [...rev().querySelectorAll("button")].find(b => b.textContent.trim() === "暂停")?.click();
  await new Promise(r => setTimeout(r, 2000));
  out.afterPause = { text: rev().textContent.replace(/\s+/g, " ").slice(0, 260) };
  return out;
})()
