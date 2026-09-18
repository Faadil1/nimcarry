(() => {
  "use strict";

  const query = new URLSearchParams(location.search);
  if (query.get("demo") !== "1") return;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest("#accept") : null;
    if (!button) return;

    // app.js owns the state mutation. This demo-only layer runs after that
    // handler and makes the successful transition visible to a presenter.
    setTimeout(() => {
      let stored;
      try {
        stored = JSON.parse(localStorage.getItem("carryone.demo") || "null");
      } catch {
        return;
      }

      const missionId = stored?.mission?.mission_id;
      if (!missionId || stored?.invitation?.status !== "ACCEPTED") return;

      const tour = query.get("tour") === "1" ? "&tour=1" : "";
      history.pushState({}, "", `/mission/${encodeURIComponent(missionId)}?demo=1${tour}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, 0);
  });
})();
