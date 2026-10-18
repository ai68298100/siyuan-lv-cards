(() => {
  const p = window.siyuan.ws.app.plugins[0];
  return {
    addBreadcrumbButtonType: typeof p.addBreadcrumbButton,
    reviewModuleOn: p.settings?.modules?.review,
    protyleCount: document.querySelectorAll(".protyle").length,
  };
})()
