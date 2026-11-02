function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid date is required.");
  return date;
}

export function localDateKey(value) {
  const date = asDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localStartOfDay(value) {
  const date = asDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(value, days) {
  const date = asDate(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

export function previousLocalDay(value) {
  return addLocalDays(value, -1);
}

export function localDateInputToEnd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toISOString();
}
