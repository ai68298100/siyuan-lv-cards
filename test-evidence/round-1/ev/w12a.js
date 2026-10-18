(() => {
  const hub = document.querySelector("[class*=lv-hub]");
  const goalSection = hub?.textContent?.includes("目标") ?? false;
  const emptyOrContent = hub?.textContent?.replace(/\s+/g, " ")?.slice(0, 200);
  return { goalSection, emptyOrContent };
})()
