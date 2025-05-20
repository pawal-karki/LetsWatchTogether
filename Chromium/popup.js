//logique of popup butttons
document.getElementById("code-btn").addEventListener("click", () => {
  chrome.tabs.create({
    url: "https://github.com/pawal-karki/LetsWatchTogether",
  });
});

document.getElementById("coffee-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://ko-fi.com/pawal_karki" });
});

document.getElementById("bug-btn").addEventListener("click", () => {
  chrome.tabs.create({
    url: "https://github.com/pawal-karki/LetsWatchTogether/issues/new?template=bug_report.md",
  });
});

//get version of the extension
document.addEventListener("DOMContentLoaded", () => {
  const versionEl = document.getElementById("version");
  if (versionEl) {
    const manifestData = chrome.runtime.getManifest();
    versionEl.textContent = `v${manifestData.version}`;
  }
});
