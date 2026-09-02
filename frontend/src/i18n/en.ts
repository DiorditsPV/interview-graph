// Словарь RU → EN интерфейса. Ключ — русская строка ровно как в коде (см. i18n.tsx):
// изменил фразу в коде — измени ключ здесь, иначе перевод молча потеряется.
// Группы — по файлам; подстановки вида {name} сохраняются как есть.
export const EN: Record<string, string> = {
  // --- HomePage ---
  "Интервью · доска вопросов": "Interview · question board",
  "Направления": "Tracks",
  "Разделы": "Sections",
  "Начать интервью": "Start interview",
  "банк вопросов →": "question bank →",
  "+ Новое направление": "+ New track",

  // --- PageShell / BoardPage (ряд 1) ---
  "← Меню": "← Menu",
  "Главное меню": "Main menu",
  "Настройки": "Settings",

  // --- LangSwitch ---
  "Русский": "Russian",
  "English": "English",
};
