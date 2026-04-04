import {
  SPECIALISTS,
  getStoredSpecialistId,
  setStoredSpecialistId,
  getSpecialistNameById,
} from "./specialists.js";

function updateCurrentLabel(el, specialistId) {
  if (!el) return;
  const name = getSpecialistNameById(specialistId);
  el.textContent = name || "Не выбран";
}

/**
 * Инициализация модального окна выбора специалиста (одинаковые id на страницах тестов).
 */
export function initSpecialistModal() {
  const modal = document.getElementById("specialist-modal");
  const btnOpen = document.getElementById("btn-specialist");
  const currentEl = document.getElementById("specialist-current");
  const listEl = document.getElementById("specialist-modal-list");
  const btnClose = document.getElementById("specialist-modal-close");

  if (!modal || !btnOpen || !listEl) return;

  const stored = getStoredSpecialistId();
  updateCurrentLabel(currentEl, stored);

  listEl.replaceChildren();
  SPECIALISTS.forEach((s) => {
    const id = `specialist-opt-${s.id}`;
    const label = document.createElement("label");
    label.className = "specialist-modal__option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "specialist-choice";
    input.value = s.id;
    input.id = id;
    if (s.id === stored) input.checked = true;
    const span = document.createElement("span");
    span.textContent = s.name;
    label.appendChild(input);
    label.appendChild(span);
    listEl.appendChild(label);
  });

  listEl.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.name === "specialist-choice") {
      setStoredSpecialistId(t.value);
      updateCurrentLabel(currentEl, t.value);
    }
  });

  function openModal() {
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    const checked = listEl.querySelector('input[name="specialist-choice"]:checked');
    const focusEl = checked || listEl.querySelector("input");
    if (focusEl instanceof HTMLElement) focusEl.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    btnOpen.focus();
  }

  btnOpen.addEventListener("click", () => openModal());

  const backdrop = modal.querySelector(".specialist-modal__backdrop");
  backdrop?.addEventListener("click", closeModal);
  btnClose?.addEventListener("click", closeModal);

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}
