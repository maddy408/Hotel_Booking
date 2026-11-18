export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const WEEKDAY_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function formatSelectedDateText(date) {
  if (!date) return '';
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  const weekday = WEEKDAY_FULL[date.getDay()];
  return `${day} ${month} ${year} (${weekday})`;
}

export function getCalendarGrid(year, month) {
  const firstDayWeekday = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days = [];

  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateObj = new Date(year, month - 1, dayNum);
    days.push({
      date: dateObj,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isPrevMonth: true,
      isNextMonth: false,
      year: dateObj.getFullYear(),
      month: dateObj.getMonth(),
    });
  }

  for (let dayNum = 1; dayNum <= daysInCurrentMonth; dayNum++) {
    const dateObj = new Date(year, month, dayNum);
    days.push({
      date: dateObj,
      dayNumber: dayNum,
      isCurrentMonth: true,
      isPrevMonth: false,
      isNextMonth: false,
      year,
      month,
    });
  }

  const totalCells = days.length <= 35 ? 35 : 42;
  const trailingNeeded = totalCells - days.length;
  for (let dayNum = 1; dayNum <= trailingNeeded; dayNum++) {
    const dateObj = new Date(year, month + 1, dayNum);
    days.push({
      date: dateObj,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isPrevMonth: false,
      isNextMonth: true,
      year: dateObj.getFullYear(),
      month: dateObj.getMonth(),
    });
  }

  return days;
}
