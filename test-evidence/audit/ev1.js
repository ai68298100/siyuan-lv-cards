(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  if (!dlg) return { onboarding: false };
  const btns = [...dlg.querySelectorAll("button")].map(b => b.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
  return { onboarding: true, title: dlg.textContent.includes("上手") || dlg.textContent.includes("Get started"), buttons: btns.slice(0, 12), text: dlg.textContent.replace(/\s+/g, " ").slice(0, 200) };
})()
