/**
 * Инициализация правого рельса с номерами вопросов (десктоп).
 * Отвеченные пункты подсвечиваются через isAnswered(i).
 *
 * @param {{
 *   railEl: HTMLElement | null;
 *   form: HTMLFormElement;
 *   count: number;
 *   headingId: (i: number) => string;
 *   isAnswered: (i: number) => boolean;
 *   title?: string;
 * }} opts
 * @returns {{ update: () => void; getButtons: () => HTMLButtonElement[] }}
 */
export function initQuestionNavRail({
  railEl,
  form,
  count,
  headingId,
  isAnswered,
  title = "Пункты",
}) {
  const noop = () => {};
  if (!railEl || !form || count < 1) {
    return { update: noop, getButtons: () => [] };
  }

  railEl.replaceChildren();

  const header = document.createElement("div");
  header.className = "question-rail__header";
  header.textContent = title;

  const scroll = document.createElement("div");
  scroll.className = "question-rail__scroll";

  const grid = document.createElement("div");
  grid.className = "question-rail__grid";

  /** @type {HTMLButtonElement[]} */
  const buttons = [];

  for (let i = 1; i <= count; i += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "question-rail__btn question-rail__btn--empty";
    btn.textContent = String(i);
    btn.setAttribute("aria-label", `Перейти к вопросу ${i}`);
    btn.addEventListener("click", () => {
      const el = document.getElementById(headingId(i));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    buttons.push(btn);
    grid.appendChild(btn);
  }

  scroll.appendChild(grid);
  railEl.appendChild(header);
  railEl.appendChild(scroll);

  function update() {
    for (let i = 1; i <= count; i += 1) {
      const ok = isAnswered(i);
      const b = buttons[i - 1];
      b.classList.toggle("question-rail__btn--answered", ok);
      b.classList.toggle("question-rail__btn--empty", !ok);
    }
  }

  form.addEventListener("change", update);
  form.addEventListener("input", update);
  update();

  return { update, getButtons: () => buttons.slice() };
}
