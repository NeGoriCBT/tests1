/**
 * SIFS — The Self and Interpersonal Functioning Scale
 * Шкала личностного и межличностного функционирования (русская версия).
 * Обратные пункты (R): инверсия сырого балла: 4 − ответ.
 */

export const SIFS_SCALE = [
  { score: 0, text: "Утверждение совсем не описывает меня" },
  { score: 1, text: "Утверждение едва описывает меня" },
  { score: 2, text: "Утверждение умеренно описывает меня" },
  { score: 3, text: "Утверждение во многом описывает меня" },
  { score: 4, text: "Утверждение описывает меня" },
];

/** @typedef {"selfAwareness" | "selfDirection" | "empathy" | "trust"} SifsSubscale */

/** @type {Array<{ id: number, text: string, subscale: SifsSubscale, reverse: boolean }>} */
export const SIFS_ITEMS = [
  {
    id: 1,
    text: "Я способен выносить большинство своих эмоций и хорошо управлять ими.",
    subscale: "selfAwareness",
    reverse: true,
  },
  {
    id: 2,
    text: "На моей самооценке сильно сказываются мои неудачи или разочарования.",
    subscale: "selfAwareness",
    reverse: false,
  },
  {
    id: 3,
    text: "Я чувствую глубокую пустоту внутри себя.",
    subscale: "selfAwareness",
    reverse: false,
  },
  {
    id: 4,
    text: "Я склонен путать свои эмоции с эмоциями других людей.",
    subscale: "selfAwareness",
    reverse: false,
  },
  {
    id: 5,
    text: "Я запутался в том, кто я есть на самом деле.",
    subscale: "selfAwareness",
    reverse: false,
  },
  {
    id: 6,
    text: "Я узнаю себя в том, как меня описывают другие.",
    subscale: "selfAwareness",
    reverse: true,
  },
  {
    id: 7,
    text: "Мне часто кажется, что моя жизнь не имеет смысла.",
    subscale: "selfAwareness",
    reverse: false,
  },
  {
    id: 8,
    text: "Я ставлю перед собой разумные цели и предпринимаю реальные меры для их достижения.",
    subscale: "selfDirection",
    reverse: true,
  },
  {
    id: 9,
    text: "Иногда я не понимаю, почему я вёл себя определённым образом или почему принял некоторые решения.",
    subscale: "selfDirection",
    reverse: false,
  },
  {
    id: 10,
    text: "В своих действиях и решениях я руководствуюсь своими неотложными потребностями, невзирая на всё остальное.",
    subscale: "selfDirection",
    reverse: false,
  },
  {
    id: 11,
    text: "Я часто меняю свои планы и жизненные цели.",
    subscale: "selfDirection",
    reverse: false,
  },
  {
    id: 12,
    text: "Мои действия и мои решения соответствуют моим ценностям и убеждениям.",
    subscale: "selfDirection",
    reverse: true,
  },
  {
    id: 13,
    text: "Люди часто негативно реагируют на мои слова или мои действия, и я не до конца понимаю, почему.",
    subscale: "empathy",
    reverse: false,
  },
  {
    id: 14,
    text: "Люди критикуют меня за то, что я нечуток к другим.",
    subscale: "empathy",
    reverse: false,
  },
  {
    id: 15,
    text: "Я часто нахожусь в замешательстве, почему люди ведут себя по отношению ко мне определённым образом.",
    subscale: "empathy",
    reverse: false,
  },
  {
    id: 16,
    text: "Меня мало интересуют чувства или проблемы других людей.",
    subscale: "empathy",
    reverse: false,
  },
  {
    id: 17,
    text: "Во время беседы мне любопытно и интересно узнать точку зрения других людей.",
    subscale: "empathy",
    reverse: true,
  },
  {
    id: 18,
    text: "Когда кто-то думает не так, как я, или возражает мне, я склонен реагировать негативно или гневно, даже если этот человек вёл себя уважительно.",
    subscale: "empathy",
    reverse: false,
  },
  {
    id: 19,
    text: "У меня много межличностных отношений, которые приносят удовлетворение мне и другому человеку.",
    subscale: "trust",
    reverse: true,
  },
  {
    id: 20,
    text: "Как правило, мои дружеские или любовные отношения длятся не очень долго.",
    subscale: "trust",
    reverse: false,
  },
  {
    id: 21,
    text: "Если я нахожусь в отношениях с другими людьми, то это в первую очередь потому, что я хочу, чтобы они удовлетворяли некоторые из моих потребностей.",
    subscale: "trust",
    reverse: false,
  },
  {
    id: 22,
    text: "На самом деле я не испытываю желания или интереса поддерживать взаимоотношения с другими людьми.",
    subscale: "trust",
    reverse: false,
  },
  {
    id: 23,
    text: "Я не доверяю другим и предпочитаю держаться с ними на некотором расстоянии, чтобы избежать от них вреда.",
    subscale: "trust",
    reverse: false,
  },
  {
    id: 24,
    text: "В моей жизни есть много людей, с которыми я близок и поддерживаю отношения, основанные на уважении, привязанности и взаимной поддержке.",
    subscale: "trust",
    reverse: true,
  },
];

export const SIFS_SUBSCALE_LABELS = {
  selfAwareness: "Самосознание",
  selfDirection: "Самонаправленность",
  empathy: "Эмпатия",
  trust: "Потребность в доверительных отношениях",
};

/**
 * @param {number} raw — ответ 0–4
 * @param {boolean} reverse
 */
export function adjustedScore(raw, reverse) {
  if (raw == null || Number.isNaN(raw)) return null;
  return reverse ? 4 - raw : raw;
}

/**
 * @param {Array<{ id: number, score: number }>} perItem — сырые баллы
 */
export function computeSifsScores(perItem) {
  const byId = new Map(perItem.map((r) => [r.id, r]));
  const means = {};
  /** @type {SifsSubscale[]} */
  const keys = ["selfAwareness", "selfDirection", "empathy", "trust"];
  keys.forEach((k) => {
    const items = SIFS_ITEMS.filter((it) => it.subscale === k);
    let sum = 0;
    items.forEach((it) => {
      const row = byId.get(it.id);
      const raw = row?.score;
      const adj = adjustedScore(raw, it.reverse);
      sum += adj ?? 0;
    });
    means[k] = sum / items.length;
  });

  const totalScore =
    means.selfAwareness + means.selfDirection + means.empathy + means.trust;
  const severityCoeff = totalScore / 4;

  return { means, totalScore, severityCoeff };
}

/**
 * Интерпретация коэффициента тяжести (по методическим указаниям).
 * @param {number} coeff
 */
export function interpretSifsSeverity(coeff) {
  if (coeff < 1.3) {
    return "Ниже порога 1,30: интерпретация по приведённым диапазонам не предусмотрена.";
  }
  if (coeff <= 1.89) {
    return "Лёгкая степень расстройства личности (коэффициент 1,30–1,89).";
  }
  if (coeff <= 2.49) {
    return "Умеренная степень расстройства личности (коэффициент 1,90–2,49).";
  }
  if (coeff <= 2.5) {
    return "Значение между умеренным (до 2,49) и тяжёлым (более 2,5); при необходимости сверьтесь с первоисточником.";
  }
  return "Тяжёлая степень расстройства личности (коэффициент более 2,5).";
}

export function formatCoeff(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
