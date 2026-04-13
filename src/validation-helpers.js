/**
 * Прокрутка к первому пропущенному вопросу и попытка фокуса на поле ввода.
 * @param {number} itemId — номер пункта (как в опроснике)
 * @param {"bdi" | "bai" | "hdrs" | "hars" | "scl90"} testId
 */
export function scrollToFirstMissingQuestion(itemId, testId) {
  const headingIds = {
    bdi: `bdi-heading-${itemId}`,
    bai: `bai-heading-${itemId}`,
    hdrs: `hdrs-heading-${itemId}`,
    hars: `hars-heading-${itemId}`,
    scl90: `scl90-h-${itemId}`,
  };
  const hid = headingIds[testId];
  if (!hid) return;
  const el = document.getElementById(hid);
  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => {
    const tr = el.closest("tr");
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const inp = fieldset.querySelector("input");
      if (inp) inp.focus();
      return;
    }
    if (tr) {
      const inp = tr.querySelector('input[type="radio"]');
      if (inp) inp.focus();
    }
  }, 450);
}

/** Прокрутка к вопросу, затем сообщение (чтобы успела начаться анимация прокрутки). */
export function scrollToQuestionThenAlert(itemId, testId, message, delayMs = 320) {
  scrollToFirstMissingQuestion(itemId, testId);
  window.setTimeout(() => {
    alert(message);
  }, delayMs);
}
