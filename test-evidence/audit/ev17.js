(() => {
  const content = document.querySelector(".lv-card-content");
  return {
    html: content?.innerHTML?.slice(0, 600) ?? null,
    markSpans: content?.querySelectorAll('[data-type="mark"]').length ?? 0,
  };
})()
