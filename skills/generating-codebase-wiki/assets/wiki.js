(function () {
  function bootMermaid() {
    if (!window.mermaid) return;
    window.mermaid.initialize({
      startOnLoad: true,
      securityLevel: "strict",
      theme: "neutral",
      flowchart: { curve: "basis", padding: 12 },
    });
  }

  function filterNav(q) {
    var needle = (q || "").trim().toLowerCase();
    document.querySelectorAll(".sidebar-nav li").forEach(function (li) {
      var text = (li.textContent || "").toLowerCase();
      li.hidden = needle !== "" && text.indexOf(needle) === -1;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bootMermaid();
    var search = document.querySelector("[data-wiki-search]");
    if (search) {
      search.addEventListener("input", function (e) {
        filterNav(e.target.value);
      });
    }
  });
})();
