export const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Renvoie l'ISO date (YYYY-MM-DD) pour un (année, mois 0-indexé, jour)
export function toIsoDate(year, monthIndex, day) {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

// Construit une grille de semaines (tableaux de 7) pour un mois donné.
// Chaque cellule est soit null (jour hors mois) soit { day, weekday, iso }.
export function buildMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  // getDay() : 0=dimanche..6=samedi -> on veut 0=lundi..6=dimanche
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day);
    const weekday = WEEKDAYS[(date.getDay() + 6) % 7];
    cells.push({ day, weekday, iso: toIsoDate(year, monthIndex, day) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
