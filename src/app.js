// The Other Side — client script
// Topic picker (choice stored in localStorage only), search, and topic requests.

(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // ---------- topic page ----------
  const picker = document.getElementById("picker");
  if (picker) {
    const slug = picker.dataset.slug;
    const key = "tos-choice:" + slug;
    const results = document.getElementById("results");
    const yourSide = document.getElementById("your-side");
    const yourCards = document.getElementById("your-side-cards");
    const otherCards = document.getElementById("other-sides-cards");
    const otherTitle = document.getElementById("other-sides-title");
    const label = document.getElementById("choice-label");
    const note = document.getElementById("choice-note");
    const camps = Array.from(document.querySelectorAll(".camp")).sort(
      (a, b) => a.dataset.camp - b.dataset.camp
    );
    const nameOf = (i) => camps[i].querySelector(".camp-name").textContent;

    function show(choice, scroll) {
      // Reset to original order
      camps.forEach((c) => otherCards.appendChild(c));
      note.hidden = true;

      if (choice === "unsure" || choice === "other") {
        yourSide.hidden = true;
        otherTitle.textContent = "All the sides";
        label.textContent = choice === "unsure" ? "You picked: Not sure" : "You picked: Something else";
        note.textContent =
          choice === "unsure"
            ? "Good place to start. Here's every major view, explained by the people who hold it."
            : "Real debates have more corners than any page can fit. Here's how the main camps see it — your view might borrow from a few.";
        note.hidden = false;
      } else {
        const i = Number(choice);
        if (!camps[i]) return reset();
        yourCards.appendChild(camps[i]);
        yourSide.hidden = false;
        otherTitle.textContent = camps.length - 1 === 1 ? "The other side" : "The other sides";
        label.textContent = "You picked: " + nameOf(i);
      }

      picker.hidden = true;
      results.classList.add("revealed");
      if (scroll) results.focus({ preventScroll: true }), results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function reset() {
      store.del(key);
      results.classList.remove("revealed");
      picker.hidden = false;
      picker.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    picker.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-choice]");
      if (!btn) return;
      store.set(key, btn.dataset.choice);
      show(btn.dataset.choice, true);
    });
    document.getElementById("change-choice").addEventListener("click", reset);

    const saved = store.get(key);
    if (saved !== null) show(saved, false);
  }

  // ---------- search page ----------
  const resultsEl = document.getElementById("search-results");
  if (resultsEl) {
    const q = (new URLSearchParams(location.search).get("q") || "").trim();
    const notCovered = document.getElementById("not-covered");
    const form = document.getElementById("request-form");
    const thanks = document.getElementById("request-thanks");
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    if (new URLSearchParams(location.search).has("requested")) {
      notCovered.hidden = false;
      form.hidden = true;
      thanks.hidden = false;
    }

    if (q) {
      document.querySelector('.search-form input[name="q"]').value = q;
      fetch("/search-index.json")
        .then((r) => r.json())
        .then((index) => {
          const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
          const hits = index
            .map((e) => ({ e, score: words.filter((w) => e.text.includes(w)).length + (e.topic.toLowerCase().includes(q.toLowerCase()) ? 5 : 0) }))
            .filter((h) => h.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((h) => h.e);

          resultsEl.innerHTML = hits
            .map((e) => `
<a class="topic-card" href="/topic/${e.slug}/">
  <span class="topic-card-cat">${esc(e.category)}</span>
  <span class="topic-card-title">${esc(e.topic)}</span>
  <span class="topic-card-hook">${esc(e.hook)}</span>
  <span class="topic-card-meta">${e.camps.length} sides</span>
</a>`)
            .join("");

          if (!hits.length) {
            notCovered.hidden = false;
            document.getElementById("request-topic").value = q;
          }
        });
    }

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      })
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          form.hidden = true;
          thanks.hidden = false;
        })
        .catch(() => {
          thanks.textContent = "Couldn't send that just now — please try again in a moment.";
          thanks.hidden = false;
        });
    });
  }
})();
