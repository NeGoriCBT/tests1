/** FFiCD: 121 пункт, шкала 1–5. Импорт текстов — fficd-items.json */

import FFICD_ITEM_TEXTS from "./fficd-items.json";

export { FFICD_ITEM_TEXTS };

export const FFICD_N = 121;

export const FFICD_SCALE = [
  { score: 1, text: "Абсолютно не согласен" },
  { score: 2, text: "Не согласен" },
  { score: 3, text: "Затрудняюсь ответить (неопределённый ответ)" },
  { score: 4, text: "Согласен" },
  { score: 5, text: "Абсолютно согласен" },
];

/** Пять доменов МКБ-11 — номера пунктов 1-based по ключу */
export const FFICD_DOMAINS = [
  {
    code: "AN",
    name: "Ананкастность",
    items: [3, 8, 14, 20, 25, 32, 37, 40, 46, 53, 57, 64, 70, 74, 81, 85, 92, 98, 101, 107, 117, 121],
  },
  {
    code: "DIS",
    name: "Диссоциальность",
    items: [5, 9, 15, 21, 28, 33, 38, 41, 48, 54, 60, 65, 71, 76, 82, 87, 94, 99, 102, 108, 111, 113],
  },
  {
    code: "RAS",
    name: "Расторможенность",
    items: [6, 11, 17, 23, 27, 29, 35, 43, 47, 50, 56, 62, 67, 73, 78, 84, 89, 93, 96, 104, 110, 114, 118, 120],
  },
  {
    code: "OTS",
    name: "Отстранённость",
    items: [2, 13, 19, 24, 31, 44, 52, 59, 68, 80, 91, 106, 116],
  },
  {
    code: "NEG",
    name: "Негативная аффективность",
    items: [
      1, 4, 7, 10, 12, 16, 18, 22, 26, 30, 34, 36, 39, 42, 45, 49, 51, 55, 58, 61, 63, 66, 69, 72, 75, 77, 79, 83,
      86, 88, 90, 95, 97, 100, 103, 105, 109, 112, 115, 119,
    ],
  },
];

/** Субдомены (по ключу русской версии) */
export const FFICD_SUBDOMAINS = [
  { domainCode: "DIS", name: "Агрессия", items: [15, 33, 48, 71, 87, 102] },
  { domainCode: "DIS", name: "Недостаток эмпатии", items: [9, 28, 41, 60, 65, 82, 99, 111] },
  { domainCode: "DIS", name: "Эгоцентризм", items: [5, 21, 38, 54, 76, 94, 108, 113] },
  { domainCode: "NEG", name: "Ирритабельность", items: [10, 30, 49, 69, 86, 119] },
  { domainCode: "NEG", name: "Тревожность", items: [1, 22, 39, 77, 97, 109] },
  { domainCode: "NEG", name: "Депрессивность", items: [12, 34, 51, 58, 72, 88, 103, 115] },
  { domainCode: "NEG", name: "Эмоциональная лабильность", items: [7, 45, 55, 66, 83, 112] },
  { domainCode: "NEG", name: "Недоверчивость", items: [18, 63, 95] },
  { domainCode: "NEG", name: "Чувство стыда", items: [16, 36, 61, 75, 90, 105] },
  { domainCode: "NEG", name: "Ранимость", items: [4, 26, 42, 79, 100] },
  { domainCode: "RAS", name: "Неорганизованность", items: [17, 50, 73, 84, 118] },
  { domainCode: "RAS", name: "Безответственность", items: [11, 27, 35, 43, 47, 67, 78, 93, 96, 110] },
  { domainCode: "RAS", name: "Опрометчивость", items: [6, 29, 62, 89, 104, 114] },
  { domainCode: "RAS", name: "Поиск острых ощущений", items: [23, 56, 120] },
  { domainCode: "OTS", name: "Эмоциональная отстранённость", items: [13, 31, 44, 68, 106, 116] },
  { domainCode: "OTS", name: "Социальная отстранённость", items: [2, 24, 52, 91] },
  { domainCode: "OTS", name: "Неуверенность", items: [19, 59, 80] },
  { domainCode: "AN", name: "Негибкость", items: [14, 25, 32, 40, 53, 70, 85, 98, 107, 121] },
  { domainCode: "AN", name: "Перфекционизм", items: [3, 20, 37, 57, 74, 92] },
  { domainCode: "AN", name: "Трудоголизм", items: [8, 46, 64, 81, 101, 117] },
];

/** Нюансы — для детального профиля */
export const FFICD_NUANCES = [
  { domainCode: "DIS", name: "Пассивная агрессия", items: [48, 102] },
  { domainCode: "DIS", name: "Физическая агрессия", items: [15, 71] },
  { domainCode: "DIS", name: "Вербальная агрессия", items: [33, 87] },
  { domainCode: "DIS", name: "Бессердечность", items: [9, 60, 99] },
  { domainCode: "DIS", name: "Корыстность", items: [28, 82] },
  { domainCode: "DIS", name: "Расчётливость", items: [41, 65, 111] },
  { domainCode: "DIS", name: "Высокомерие", items: [54, 113] },
  { domainCode: "DIS", name: "Вседозволенность", items: [21, 94] },
  { domainCode: "DIS", name: "Эгоизм", items: [5, 76] },
  { domainCode: "DIS", name: "Тщеславие", items: [38, 108] },
  { domainCode: "NEG", name: "Раздражительность", items: [49, 86] },
  { domainCode: "NEG", name: "Нерегулируемый гнев", items: [10, 69] },
  { domainCode: "NEG", name: "Реактивный гнев", items: [30, 119] },
  { domainCode: "NEG", name: "Значимость внешней оценки", items: [1, 77] },
  { domainCode: "NEG", name: "Ненадёжная привязанность", items: [22, 97] },
  { domainCode: "NEG", name: "Социальная тревожность", items: [39, 109] },
  {
    domainCode: "NEG",
    name: "Чувство собственной неадекватности в межличностных отношениях",
    items: [12, 72],
  },
  { domainCode: "NEG", name: "Пессимизм", items: [51, 103] },
  { domainCode: "NEG", name: "Суицидальность", items: [34, 88] },
  { domainCode: "NEG", name: "Чувство бесполезности", items: [58, 115] },
  { domainCode: "NEG", name: "Нарушение эмоциональной регуляции", items: [7, 55, 83] },
  { domainCode: "NEG", name: "Быстрая смена эмоций", items: [45, 66, 112] },
  { domainCode: "NEG", name: "Уничижение", items: [36, 75, 105] },
  { domainCode: "NEG", name: "Застенчивость", items: [16, 61, 90] },
  { domainCode: "NEG", name: "Хрупкость", items: [4, 42, 100] },
  { domainCode: "NEG", name: "Потребность в восхищении", items: [26, 79] },
  { domainCode: "RAS", name: "Дезорганизация", items: [17, 73, 118] },
  { domainCode: "RAS", name: "Неорганизованная речь", items: [50, 84] },
  { domainCode: "RAS", name: "Необязательность", items: [47, 96] },
  { domainCode: "RAS", name: "Отвлекаемость", items: [35, 78, 93] },
  { domainCode: "RAS", name: "Невыносливость", items: [11, 27, 67] },
  { domainCode: "RAS", name: "Некомпетентность", items: [43, 110] },
  { domainCode: "RAS", name: "Опрометчивое поведение", items: [6, 62, 104] },
  { domainCode: "RAS", name: "Опрометчивое мышление", items: [29, 89, 114] },
  { domainCode: "OTS", name: "Безрадостность", items: [13, 68] },
  { domainCode: "OTS", name: "Физическая ангедония", items: [44, 116] },
  { domainCode: "OTS", name: "Социальная ангедония", items: [31, 106] },
  { domainCode: "OTS", name: "Равнодушие", items: [24, 91] },
  { domainCode: "OTS", name: "Социальная изоляция", items: [2, 52] },
  { domainCode: "AN", name: "Догматизм", items: [40, 70, 121] },
  { domainCode: "AN", name: "Ригидность", items: [14, 85] },
  { domainCode: "AN", name: "Неприятие риска", items: [32, 98] },
  { domainCode: "AN", name: "Руминативное размышление", items: [25, 53, 107] },
  { domainCode: "AN", name: "Привередливость", items: [3, 37, 74] },
  { domainCode: "AN", name: "Педантичность", items: [20, 57, 92] },
  { domainCode: "AN", name: "Упрямство", items: [64, 101, 117] },
  { domainCode: "AN", name: "Усердие в работе", items: [8, 46, 81] },
];

function meanForItems(scores, itemNums) {
  if (itemNums.length === 0) return null;
  const sum = itemNums.reduce((s, n) => s + scores[n - 1], 0);
  return { sum, n: itemNums.length, mean: sum / itemNums.length };
}

/**
 * @param {number[]} scores — 121 значение 1–5
 */
export function computeFficdProfile(scores) {
  if (scores.length !== FFICD_N) throw new Error(`Ожидается ${FFICD_N} ответов`);

  const domains = FFICD_DOMAINS.map((d) => {
    const m = meanForItems(scores, d.items);
    return { ...d, ...m };
  });

  const subdomains = FFICD_SUBDOMAINS.map((sd) => {
    const m = meanForItems(scores, sd.items);
    return { ...sd, ...m };
  });

  const nuances = FFICD_NUANCES.map((nu) => {
    const m = meanForItems(scores, nu.items);
    return { ...nu, ...m };
  });

  const totalSum = scores.reduce((a, b) => a + b, 0);
  const overallMean = totalSum / FFICD_N;

  return { domains, subdomains, nuances, totalSum, overallMean };
}

export function formatFficdMean(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(2).replace(".", ",");
}
