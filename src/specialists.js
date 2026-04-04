/** Список специалистов для отчёта Word; выбор хранится в sessionStorage. */

export const SPECIALISTS = [
  { id: "gavryushin", name: "Гаврюшин К.А." },
  { id: "guliev", name: "Гулиев М. А." },
  { id: "sirazetdinov", name: "Сиразетдинов Р. Р." },
  { id: "sharafutdinov", name: "Шарафутдинов А. Р." },
];

const STORAGE_KEY = "psychTestSpecialistId";

export function getStoredSpecialistId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSpecialistId(id) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getSpecialistNameById(id) {
  if (!id) return "";
  return SPECIALISTS.find((s) => s.id === id)?.name ?? "";
}

/** Имя выбранного специалиста или пустая строка. */
export function getSelectedSpecialistName() {
  return getSpecialistNameById(getStoredSpecialistId());
}
