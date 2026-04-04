const input = document.getElementById("test-search-input");
const list = document.getElementById("test-list");
const empty = document.getElementById("test-search-empty");

if (input && list && empty) {
  function getSearchHaystack(li) {
    const card = li.querySelector(".test-card");
    if (!card) return "";
    const title = card.querySelector(".test-card__title")?.textContent ?? "";
    const meta = card.querySelector(".test-card__meta")?.textContent ?? "";
    return `${title} ${meta}`.toLowerCase();
  }

  function filterTests() {
    const q = input.value.trim().toLowerCase();
    let n = 0;
    list.querySelectorAll("li").forEach((li) => {
      const hay = getSearchHaystack(li);
      const match = !q || hay.includes(q);
      li.hidden = !match;
      if (match) n += 1;
    });
    empty.hidden = n !== 0;
  }

  input.addEventListener("input", filterTests);
  input.addEventListener("search", filterTests);
}
