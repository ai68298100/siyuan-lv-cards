(() => {
  const vis = () => [...document.querySelectorAll(".b3-dialog")].filter(d => d.getBoundingClientRect().width > 0);
  const dlg = vis()[vis().length - 1];
  return {
    scanDialog: !!dlg,
    text: dlg?.textContent?.replace(/\s+/g, " ")?.slice(0, 400) ?? null,
    toast: document.querySelector("#message")?.textContent?.replace(/\s+/g, " ")?.slice(0, 120) ?? null,
  };
})()
