/** Плавающая кнопка: вниз страницы или вверх, если уже внизу. */

const DEFAULT_THRESHOLD = 96;

export function initScrollNavButton() {
  const btn = document.getElementById("btn-scroll-flip");
  if (!btn) return;

  const down = btn.dataset.labelDown || "Вниз";
  const up = btn.dataset.labelUp || "Вверх";
  const threshold = Number(btn.dataset.threshold) || DEFAULT_THRESHOLD;

  function isNearBottom() {
    const doc = document.documentElement;
    return window.scrollY + window.innerHeight >= doc.scrollHeight - threshold;
  }

  function updateLabel() {
    const atBottom = isNearBottom();
    btn.textContent = atBottom ? `↑ ${up}` : `↓ ${down}`;
    btn.setAttribute("aria-label", atBottom ? `Прокрутить ${up}` : `Прокрутить ${down}`);
  }

  btn.addEventListener("click", () => {
    const doc = document.documentElement;
    if (isNearBottom()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: doc.scrollHeight, behavior: "smooth" });
    }
  });

  window.addEventListener("scroll", updateLabel, { passive: true });
  window.addEventListener("resize", updateLabel, { passive: true });
  updateLabel();
}
