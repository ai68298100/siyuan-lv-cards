(async () => {
  await new Promise(r => setTimeout(r, 600));
  const dlgs = document.querySelectorAll(".b3-dialog").length;
  const visible = [...document.querySelectorAll(".b3-dialog")].filter(d => d.offsetParent !== null).length;
  return { totalDialogs: dlgs, visibleDialogs: visible };
})()
