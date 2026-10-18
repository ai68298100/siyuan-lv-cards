(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[0];
  const t = dlg?.textContent?.replace(/\s+/g, " ") ?? "";
  return { step: t.match(/\d \/ 5/)?.[0] ?? null, atStep5: /旁路试练/.test(t) && /5 \/ 5/.test(t), text: t.slice(0, 260) };
})()
