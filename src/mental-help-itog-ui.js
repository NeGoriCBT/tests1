import { getComplaintBlockInstruction } from "./mental-help-complaints-data.js";
import {
  getLifeQuestionInstruction,
  helpForLifeQuestion,
  isLifeBlockTitle,
} from "./mental-help-life-instructions.js";
import { getDiseaseSectionInstruction, helpForDiseaseSection } from "./mental-help-itog-help.js";
import { LIFE_STRUCTURED_ID } from "./mental-help-v2-life.js";
import { DISEASE_STRUCTURED_ID } from "./mental-help-v2-disease.js";

let itogMode = false;

/** @param {boolean} on */
export function setItogMode(on) {
  itogMode = on;
}

export function isItogMode() {
  return itogMode;
}

/**
 * @param {HTMLElement} parent
 * @param {string} className
 * @param {string} text
 */
function appendInstructionLine(parent, className, text) {
  const instr = document.createElement("p");
  instr.className = className;
  const label = document.createElement("span");
  label.className = "mh-instruction-label";
  label.textContent = "Инструкция. ";
  instr.appendChild(label);
  instr.appendChild(document.createTextNode(text));
  parent.appendChild(instr);
}

/**
 * @param {string} title
 * @param {{ helpText?: string; instruction?: string; showHelp?: boolean; instructionLabel?: boolean }} [opts]
 */
function createItogCard(title, opts = {}) {
  const { helpText = "", instruction = "", showHelp = true, instructionLabel = false } = opts;

  const card = document.createElement("section");
  card.className = "mh-itog-card";

  const head = document.createElement("div");
  head.className = "mh-itog-card__head";

  const h = document.createElement("h3");
  h.className = "mh-itog-card__title";
  h.textContent = title;
  head.appendChild(h);

  if (showHelp && helpText) head.appendChild(createHelpButton(helpText));
  card.appendChild(head);

  const instructionText =
    instruction.trim() || (instructionLabel ? getComplaintBlockInstruction(title) : "") || "";
  if (instructionText) {
    if (instructionLabel) {
      appendInstructionLine(card, "mh-itog-card__instruction", instructionText);
    } else {
      const instr = document.createElement("p");
      instr.className = "mh-itog-card__instruction";
      instr.textContent = instructionText;
      card.appendChild(instr);
    }
  }

  const body = document.createElement("div");
  body.className = "mh-itog-card__body";
  card.appendChild(body);

  return { card, body };
}

/** @param {HTMLElement} pop */
function resetHelpPopPosition(pop) {
  pop.classList.remove("mh-itog-help__pop--fixed");
  pop.style.removeProperty("top");
  pop.style.removeProperty("left");
  pop.style.removeProperty("width");
  pop.style.removeProperty("max-width");
}

/**
 * @param {HTMLButtonElement} btn
 * @param {HTMLElement} pop
 */
function positionHelpPop(btn, pop) {
  const margin = 16;
  const gap = 6;
  const maxW = Math.min(288, window.innerWidth - margin * 2);

  pop.classList.add("mh-itog-help__pop--fixed");
  pop.style.width = `${maxW}px`;
  pop.style.maxWidth = `${maxW}px`;

  const btnRect = btn.getBoundingClientRect();
  const popW = pop.offsetWidth || maxW;
  const popH = pop.offsetHeight;

  let left = btnRect.right - popW;
  if (left < margin) left = margin;
  if (left + popW > window.innerWidth - margin) {
    left = window.innerWidth - margin - popW;
  }

  let top = btnRect.bottom + gap;
  if (top + popH > window.innerHeight - margin) {
    top = Math.max(margin, btnRect.top - gap - popH);
  }

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

/**
 * @param {string} helpText
 */
function createHelpButton(helpText) {
  const wrap = document.createElement("div");
  wrap.className = "mh-itog-help";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mh-itog-help__btn";
  btn.setAttribute("aria-label", "Пояснение к вопросу");
  btn.textContent = "?";

  const pop = document.createElement("div");
  pop.className = "mh-itog-help__pop";
  pop.hidden = true;
  pop.setAttribute("role", "tooltip");
  pop.textContent = helpText;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !pop.hidden;
    document.querySelectorAll(".mh-itog-help__pop").forEach((p) => {
      p.hidden = true;
      resetHelpPopPosition(/** @type {HTMLElement} */ (p));
    });
    document.querySelectorAll(".mh-itog-help__btn[aria-expanded='true']").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });
    if (!open) {
      pop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => positionHelpPop(btn, pop));
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(pop);
  return wrap;
}

/** @param {HTMLElement} root */
function closeHelpOnOutsideClick(root) {
  if (root.dataset.itogHelpBound) return;
  root.dataset.itogHelpBound = "1";
  document.addEventListener("click", () => {
    root.querySelectorAll(".mh-itog-help__pop").forEach((p) => {
      p.hidden = true;
      resetHelpPopPosition(/** @type {HTMLElement} */ (p));
    });
    root.querySelectorAll(".mh-itog-help__btn[aria-expanded='true']").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
    });
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      root.querySelectorAll(".mh-itog-help__pop").forEach((p) => {
        p.hidden = true;
        resetHelpPopPosition(/** @type {HTMLElement} */ (p));
      });
    }
  });
  window.addEventListener(
    "resize",
    () => {
      const openBtn = root.querySelector(".mh-itog-help__btn[aria-expanded='true']");
      const openPop = root.querySelector(".mh-itog-help__pop:not([hidden])");
      if (openBtn instanceof HTMLButtonElement && openPop instanceof HTMLElement) {
        positionHelpPop(openBtn, openPop);
      }
    },
    { passive: true },
  );
}

/** @param {string} title */
function lifeQuestionCardOpts(title) {
  const instruction = getLifeQuestionInstruction(title);
  const helpText = helpForLifeQuestion(title);
  return {
    showHelp: Boolean(helpText),
    helpText,
    instruction,
    instructionLabel: Boolean(instruction),
  };
}

/**
 * @param {HTMLElement} root
 */
function wrapFieldsetsWithLegends(root) {
  [...root.querySelectorAll("fieldset.mh-life-fieldset")].forEach((fs) => {
    if (fs.classList.contains("mh-life-fieldset--plain")) return;
    if (fs.closest(".mh-itog-card > .mh-itog-card__body")) return;
    const leg = fs.querySelector(":scope > .mh-life-legend");
    const title = leg?.textContent?.trim();
    if (!title || !leg || isLifeBlockTitle(title)) return;
    const parent = fs.parentNode;
    if (!parent) return;
    const { card, body } = createItogCard(title, lifeQuestionCardOpts(title));
    card.classList.add("mh-itog-card--life-question");
    parent.insertBefore(card, fs);
    body.appendChild(fs);
    leg.remove();
  });
}

/** @param {HTMLElement} root */
function wrapAllEduTitles(root) {
  [...root.querySelectorAll(".mh-life-edu-title")].forEach((titleEl) => {
    if (titleEl.closest(".mh-itog-card__body > .mh-itog-card")) return;
    if (titleEl.closest(".mh-itog-card__body .mh-itog-card")) return;

    const title = titleEl.textContent?.trim() || "Вопрос";
    /** @type {HTMLElement[]} */
    const group = [titleEl];
    let sib = titleEl.nextElementSibling;
    while (sib && !sib.classList.contains("mh-life-edu-title")) {
      group.push(/** @type {HTMLElement} */ (sib));
      sib = sib.nextElementSibling;
    }
    const parent = titleEl.parentNode;
    if (!parent) return;
    const { card, body } = createItogCard(title, lifeQuestionCardOpts(title));
    card.classList.add("mh-itog-card--life-question");
    parent.insertBefore(card, group[0]);
    group.forEach((n) => body.appendChild(n));
  });
}

/** @param {HTMLElement} contentEl */
export function enhanceItogLifeStep(contentEl) {
  if (!itogMode || contentEl.dataset.itogEnhanced === "1") return;
  contentEl.dataset.itogEnhanced = "1";
  closeHelpOnOutsideClick(contentEl);

  /** Только крупные блоки верхнего уровня (не вырывать вложенное из «Рождение и семья»). */
  [...contentEl.children].forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (!child.matches("fieldset.mh-life-fieldset")) return;
    if (child.classList.contains("mh-life-fieldset--plain")) return;
    const leg = child.querySelector(":scope > .mh-life-legend");
    const title = leg?.textContent?.trim();
    if (!title || !leg) return;
    const parent = child.parentNode;
    if (!parent) return;
    const { card, body } = createItogCard(title, { showHelp: false });
    card.classList.add("mh-itog-card--life-block");
    parent.insertBefore(card, child);
    body.appendChild(child);
    leg.remove();
    wrapAllEduTitles(body);
    wrapFieldsetsWithLegends(body);
  });
}

/**
 * @param {HTMLElement} episodeEl
 */
function wrapDiseaseEpisodeSections(episodeEl) {
  [...episodeEl.querySelectorAll(":scope > fieldset.mh-life-fieldset")].forEach((fs) => {
    if (fs.classList.contains("mh-dis-section")) return;
    const leg = fs.querySelector(":scope > .mh-life-legend");
    const title = leg?.textContent?.trim();
    if (!title || !leg) return;
    const parent = fs.parentNode;
    if (!parent) return;

    const section = document.createElement("section");
    section.className = "mh-dis-section";

    const head = document.createElement("div");
    head.className = "mh-dis-section__head";

    const numMatch = title.match(/^(\d+)\./);
    if (numMatch) {
      const badge = document.createElement("span");
      badge.className = "mh-dis-section__num";
      badge.textContent = numMatch[1];
      badge.setAttribute("aria-hidden", "true");
      head.appendChild(badge);
    }

    const h = document.createElement("h4");
    h.className = "mh-dis-section__title";
    h.textContent = numMatch ? title.replace(/^\d+\.\s*/, "") : title;
    head.appendChild(h);

    const helpText = helpForDiseaseSection(title);
    if (helpText) head.appendChild(createHelpButton(helpText));
    section.appendChild(head);

    const instruction = getDiseaseSectionInstruction(title);
    if (instruction) appendInstructionLine(section, "mh-dis-section__instruction", instruction);

    const body = document.createElement("div");
    body.className = "mh-dis-section__body";
    section.appendChild(body);

    parent.insertBefore(section, fs);
    body.appendChild(fs);
    leg.remove();
  });
}

/** @param {HTMLElement} epList */
function mountDiseaseEpisodeNav(epList) {
  if (epList.querySelector(":scope > .mh-dis-episode-nav")) return;
  const cards = [...epList.querySelectorAll(":scope > .mh-itog-card--disease-episode")];
  if (cards.length < 2) return;

  const nav = document.createElement("nav");
  nav.className = "mh-dis-episode-nav";
  nav.setAttribute("aria-label", "Эпизоды ухудшения");

  cards.forEach((card, i) => {
    const fullTitle = card.querySelector(".mh-itog-card__title")?.textContent?.trim() || `Эпизод ${i + 1}`;
    const shortMatch = fullTitle.match(/—\s*(.+)$/);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mh-dis-episode-nav__chip";
    if (i === 0) chip.classList.add("mh-dis-episode-nav__chip--active");
    chip.textContent = shortMatch ? shortMatch[1] : fullTitle;
    chip.setAttribute("aria-label", fullTitle);
    chip.addEventListener("click", () => {
      nav.querySelectorAll(".mh-dis-episode-nav__chip").forEach((c) => {
        c.classList.remove("mh-dis-episode-nav__chip--active");
      });
      chip.classList.add("mh-dis-episode-nav__chip--active");
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.appendChild(chip);
  });

  epList.insertBefore(nav, epList.firstChild);
}

/** @param {HTMLElement} contentEl */
export function enhanceItogDiseaseStep(contentEl) {
  if (!itogMode || contentEl.dataset.itogEnhanced === "1") return;
  contentEl.dataset.itogEnhanced = "1";
  closeHelpOnOutsideClick(contentEl);

  const epList = contentEl.querySelector("#mh-dis-episodes-list");
  if (epList instanceof HTMLElement) {
    epList.classList.add("mh-dis-episodes-list--itog");
  }

  contentEl.querySelectorAll(".mh-dis-episode").forEach((ep) => {
    if (ep.closest(".mh-itog-card")) return;
    const sub = ep.querySelector(".mh-block-subtitle");
    const title = sub?.textContent?.trim() || "Эпизод";
    const parent = ep.parentNode;
    if (!parent) return;
    const { card, body } = createItogCard(title, { helpText: helpForDiseaseSection(title) });
    card.classList.add("mh-itog-card--disease-episode");
    parent.insertBefore(card, ep);
    if (sub) sub.remove();
    ep.classList.remove("mh-dis-timeline-event");
    body.appendChild(ep);
    wrapDiseaseEpisodeSections(ep);
  });

  if (epList instanceof HTMLElement) mountDiseaseEpisodeNav(epList);

  contentEl.querySelectorAll(".btn--ghost").forEach((btn) => {
    if (btn instanceof HTMLButtonElement && btn.textContent?.includes("Добавить эпизод")) {
      btn.classList.add("mh-dis-add-episode-btn");
    }
  });
}

/** @param {HTMLElement} contentEl */
export function enhanceItogComplaintsStep(contentEl) {
  if (!itogMode) return;
  closeHelpOnOutsideClick(contentEl);
  contentEl.querySelectorAll(".mh-complaints-block").forEach((block) => {
    if (block.classList.contains("mh-itog-card")) return;
    const bt = block.querySelector(".mh-complaints-block-title");
    const title = bt?.textContent?.trim() || "Жалобы";
    const parent = block.parentNode;
    if (!parent) return;
    const instruction = getComplaintBlockInstruction(title) ?? "";
    const { card, body } = createItogCard(title, {
      instruction,
      showHelp: false,
      instructionLabel: true,
    });
    card.classList.add("mh-itog-card--complaints");
    parent.insertBefore(card, block);
    if (bt) bt.remove();
    while (block.firstChild) {
      const node = block.firstChild;
      if (
        node instanceof HTMLElement &&
        node.classList.contains("mh-complaints-block-prompt")
      ) {
        node.remove();
        continue;
      }
      body.appendChild(node);
    }
    block.remove();
  });
  const test = contentEl.querySelector(".mh-complaints-test");
  if (test instanceof HTMLElement) test.hidden = true;
}

/**
 * @param {ReadonlyArray<{ id: string }>} steps
 * @param {number} qIndex
 */
export function updateItogCategoryNav(steps, qIndex) {
  const nav = document.getElementById("mh-itog-categories");
  if (!nav) return;
  const step = steps[qIndex];
  const id = step?.id ?? "";
  nav.querySelectorAll(".mh-itog-cat").forEach((btn) => {
    const cat = btn.getAttribute("data-cat");
    let active = false;
    if (cat === "complaints" && id === "complaints") active = true;
    if (cat === "life" && id === LIFE_STRUCTURED_ID) active = true;
    if (cat === "disease" && id === DISEASE_STRUCTURED_ID) active = true;
    btn.classList.toggle("mh-itog-cat--active", active);
    btn.setAttribute("aria-current", active ? "step" : "false");
  });
}

/**
 * @param {HTMLElement} wizardEl
 */
export function mountItogCategoryNav(wizardEl) {
  const nav = document.getElementById("mh-itog-categories");
  if (!nav || nav.dataset.mounted) return;
  nav.dataset.mounted = "1";
  nav.hidden = false;
}

/** @param {HTMLElement} contentEl */
export function clearItogEnhanceFlag(contentEl) {
  delete contentEl.dataset.itogEnhanced;
}
