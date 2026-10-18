(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  let dlg = vis()[vis().length - 1];
  [...dlg.querySelectorAll("button, [role=button], .b3-card")].find(b => b.textContent.includes("卡片笔记"))?.click();
  await new Promise(r => setTimeout(r, 1000));
  dlg = vis()[vis().length - 1];
  const btns = [...dlg.querySelectorAll("button")].map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
  return { step: dlg.textContent.match(/步骤 \d \/ \d/)?.[0], buttons: btns.slice(0, 10), text: dlg.textContent.replace(/\s+/g, " ").slice(0, 260) };
})()
