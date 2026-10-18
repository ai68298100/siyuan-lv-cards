(async () => {
  await new Promise(r => setTimeout(r, 500));
  const closed = !document.querySelector(".b3-dialog");
  const p = window.siyuan.ws.app.plugins[0];
  p.openPalette();
  await new Promise(r => setTimeout(r, 1000));
  const reopened = !!document.querySelector(".b3-dialog");
  return { closedByEsc: closed, reopened, dialogResidue: document.querySelectorAll(".b3-dialog").length };
})()
