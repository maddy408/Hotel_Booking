import { useState, useMemo } from 'react';
import {
  MONTH_NAMES,
  WEEKDAYS,
  isSameDay,
  formatSelectedDateText,
  getCalendarGrid,
} from '../lib/calendar.js';
import './RoomCalendar.css';

export default function RoomCalendar({ initialDate, onDateSelect, className = '' }) {
  const [today] = useState(() => new Date());
  const initial = initialDate || today;

  const [viewYear, setViewYear] = useState(() => initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initial.getMonth());
  const [selectedDate, setSelectedDate] = useState(() => initial);

  const calendarDays = useMemo(
    () => getCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const handlePrevMonth = () => {
    setViewMonth((prevMonth) => {
      if (prevMonth === 0) {
        setViewYear((prevYear) => prevYear - 1);
        return 11;
      }
      return prevMonth - 1;
    });
  };

  const handleNextMonth = () => {
    setViewMonth((prevMonth) => {
      if (prevMonth === 11) {
        setViewYear((prevYear) => prevYear + 1);
        return 0;
      }
      return prevMonth + 1;
    });
  };

  const handleGoToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(now);
    if (onDateSelect) {
      onDateSelect(now);
    }
  };

  const handleDateClick = (item) => {
    setSelectedDate(item.date);
    if (!item.isCurrentMonth) {
      setViewYear(item.year);
      setViewMonth(item.month);
    }
    if (onDateSelect) {
      onDateSelect(item.date);
    }
  };

  return (
    <div className={`room-cal-card ${className}`.trim()} aria-label="Monthly Calendar">
      {/* 1. Purple Card Header with Icon, Heading and Compact Today Button */}
      <div className="room-cal-header">
        <div className="room-cal-header-title">
          <svg
            className="room-cal-header-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="room-cal-heading">Calendar</span>
        </div>
        <button
          type="button"
          className="room-cal-today-btn"
          onClick={handleGoToToday}
          title="Return to today's date"
          aria-label="Return to today's date"
        >
          Today
        </button>
      </div>

      <div className="room-cal-body">
        {/* 2. Month Navigation Bar with Previous Arrow, Month & Year on one horizontal line, Next Arrow */}
        <div className="room-cal-nav">
          <button
            type="button"
            className="room-cal-nav-btn prev"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            title="Previous month"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="room-cal-month-year-group">
            <span className="room-cal-month-title">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
          </div>

          <button
            type="button"
            className="room-cal-nav-btn next"
            onClick={handleNextMonth}
            aria-label="Next month"
            title="Next month"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* 3. Seven Weekday Columns */}
        <div className="room-cal-weekdays" role="row">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="room-cal-weekday" role="columnheader">
              {wd}
            </div>
          ))}
        </div>

        {/* 4. Compact Date Grid */}
        <div
          className="room-cal-grid"
          role="grid"
          aria-label={`Calendar grid for ${MONTH_NAMES[viewMonth]} ${viewYear}`}
        >
          {calendarDays.map((item, idx) => {
            const isToday = isSameDay(item.date, today);
            const isSelected = isSameDay(item.date, selectedDate);

            const cellClasses = [
              'room-cal-day',
              item.isCurrentMonth ? 'in-month' : 'out-month',
              isToday ? 'is-today' : '',
              isSelected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={`${item.year}-${item.month}-${item.dayNumber}-${idx}`}
                type="button"
                className={cellClasses}
                onClick={() => handleDateClick(item)}
                aria-label={formatSelectedDateText(item.date)}
                aria-selected={isSelected}
                role="gridcell"
                title={`${formatSelectedDateText(item.date)}${isToday ? ' (Today)' : ''}`}
              >
                <span className="room-cal-day-num">{item.dayNumber}</span>
              </button>
            );
          })}
        </div>

        {/* 5. Selected Date Information in a Small Footer */}
        <div className="room-cal-selected-info">
          <div className="room-cal-info-row">
            <svg
              className="room-cal-info-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="room-cal-info-label">Selected Date:</span>
            <strong className="room-cal-info-value">
              {formatSelectedDateText(selectedDate)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
