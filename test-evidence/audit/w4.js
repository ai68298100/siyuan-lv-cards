(async () => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  const all = dlg.textContent;
  return {
    hasEmergencyStop: all.includes("Emergency stop"),
    hasRevoke: all.includes("Revoke AI consent") || all.includes("Revoke"),
    revokeBtn: [...dlg.querySelectorAll("button")].some(b => b.textContent.includes("Revoke")),
    killTitle: all.match(/Emergency stop[^|]{0,20}/)?.[0] ?? null,
  };
})()
