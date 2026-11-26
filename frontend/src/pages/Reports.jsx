import { useState } from 'react';
import { useTodayReport, useDayEndReport, useOccupancyReport, useRevenueReport, downloadInvoicesCsv } from '../api/reports';
import { useToast } from '../context/ToastContext.jsx';
import { fd, inr, todayIso, getPresetDateRange, formatDateRangeLabel } from '../lib/format';

export const PRESET_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
];

export default function Reports() {
  const [filter, setFilter] = useState(() => getPresetDateRange('today'));
  const { data: today } = useTodayReport(filter.from, filter.to);
  const { data: dayEnd } = useDayEndReport(filter.from, filter.to);
  const { data: occupancy } = useOccupancyReport(filter.from, filter.to);
  const { data: revenue } = useRevenueReport(filter.from, filter.to);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const selectPreset = (key) => {
    if (key === 'custom') {
      setFilter((prev) => ({ ...prev, preset: 'custom' }));
    } else {
      setFilter(getPresetDateRange(key));
    }
  };

  const handleCustomDateChange = (field, val) => {
    setFilter((prev) => {
      const updated = {
        ...prev,
        [field]: val,
        preset: 'custom',
      };
      updated.label = formatDateRangeLabel(updated.from, updated.to, 'custom');
      return updated;
    });
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadInvoicesCsv(filter.from, filter.to);
      toast('Invoices CSV exported successfully.');
    } catch (err) {
      toast(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const isSingleDay = filter.from === filter.to;
  const dateSubtext = isSingleDay ? fd(filter.from) : `${fd(filter.from)} → ${fd(filter.to)}`;
  const periodLabel = filter.preset === 'today' ? 'Today' : filter.label || formatDateRangeLabel(filter.from, filter.to, filter.preset);

  const occSummary = today?.occupancy;
  const occLabel = occSummary
    ? isSingleDay
      ? `${occSummary.occupied}/${occSummary.total} (${occSummary.percent}%)`
      : `${occSummary.occupied}/${occSummary.total} avg (${occSummary.percent}%)`
    : '—';

  return (
    <div className="reports-container" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Date Filter Toolbar */}
      <div className="panel" style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div className="seg" role="tablist" aria-label="Report Period Presets">
            {PRESET_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={filter.preset === item.key ? 'active' : ''}
                aria-pressed={filter.preset === item.key}
                onClick={() => selectPreset(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date"
              value={filter.from}
              max={filter.to || todayIso()}
              onChange={(e) => handleCustomDateChange('from', e.target.value)}
              style={{ width: 140, padding: '4px 8px', fontSize: 13 }}
              aria-label="From Date"
            />
            <span className="muted" style={{ fontSize: 12 }}>to</span>
            <input
              type="date"
              value={filter.to}
              min={filter.from}
              max={todayIso()}
              onChange={(e) => handleCustomDateChange('to', e.target.value)}
              style={{ width: 140, padding: '4px 8px', fontSize: 13 }}
              aria-label="To Date"
            />
          </div>
        </div>
      </div>

      {/* 2. Today at a Glance */}
      <div className="panel">
        <div className="ph" style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle, #F1F5F9)' }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>
            {filter.preset === 'today' ? 'Today at a glance' : `${periodLabel} at a glance`}
          </h2>
          <span className="muted" style={{ fontSize: 12 }}>{dateSubtext}</span>
        </div>
        <div className="report-glance-grid">
          <div className="report-glance-card">
            <span className="report-card-label">Check-outs</span>
            <b className="report-card-value">{today ? (today.checkouts ?? '—') : '—'}</b>
          </div>
          <div className="report-glance-card">
            <span className="report-card-label">Billed</span>
            <b className="report-card-value">{inr(today ? (today.billedAtCheckout ?? 0) : 0)}</b>
          </div>
          <div className="report-glance-card">
            <span className="report-card-label">Advance Taken</span>
            <b className="report-card-value">{inr(today ? (today.advanceTaken ?? 0) : 0)}</b>
          </div>
          <div className="report-glance-card">
            <span className="report-card-label">Balance Collected</span>
            <b className="report-card-value">{inr(today ? (today.balanceCollected ?? 0) : 0)}</b>
          </div>
          <div className="report-glance-card">
            <span className="report-card-label">Occupancy</span>
            <b className="report-card-value">{occLabel}</b>
          </div>
        </div>
      </div>

      {/* 3 & 4. Balanced 2-Column Section: Money Received + Revenue Summary */}
      <div className="report-columns-grid">
        {/* 3. Money Received */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="ph" style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle, #F1F5F9)' }}>
            <div>
              <h2 style={{ fontSize: 15, margin: 0 }}>Money Received</h2>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {isSingleDay ? `Day-end collection (${fd(filter.from)})` : `Day-end collection (${dateSubtext})`}
              </span>
            </div>
          </div>
          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="report-methods-row">
              <div className="report-method-box">
                <div className="report-method-label">Cash</div>
                <div className="report-method-value">{inr(dayEnd?.byMethod?.cash ?? 0)}</div>
              </div>
              <div className="report-method-box">
                <div className="report-method-label">UPI</div>
                <div className="report-method-value">{inr(dayEnd?.byMethod?.upi ?? 0)}</div>
              </div>
              <div className="report-method-box">
                <div className="report-method-label">Card</div>
                <div className="report-method-value">{inr(dayEnd?.byMethod?.card ?? 0)}</div>
              </div>
            </div>

            <div>
              <div className="report-highlight-row">
                <span className="report-highlight-label">Total Received</span>
                <b className="report-highlight-value">{inr(dayEnd?.total ?? 0)}</b>
              </div>

              {isSingleDay && dayEnd?.occupiedRooms !== undefined && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                  Rooms occupied that night: <b className="mono">{dayEnd.occupiedRooms}</b>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Revenue Summary */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="ph" style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle, #F1F5F9)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 15, margin: 0 }}>Revenue Summary</h2>
              <span className="muted" style={{ fontSize: 11.5 }}>{periodLabel}</span>
            </div>
            <button
              className="btn sm dark report-export-btn"
              type="button"
              disabled={exporting}
              onClick={exportCsv}
              style={{ padding: '5px 12px', fontSize: 12.5 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>
          </div>
          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="report-simple-rows">
              <div className="report-simple-row">
                <span className="report-simple-label">Invoices</span>
                <b className="report-simple-value">{revenue ? (revenue.totals?.invoiceCount ?? 0) : 0}</b>
              </div>
              <div className="report-simple-row">
                <span className="report-simple-label">Room Revenue</span>
                <b className="report-simple-value">{inr(revenue ? (revenue.totals?.roomAmount ?? 0) : 0)}</b>
              </div>
              <div className="report-simple-row">
                <span className="report-simple-label">GST Collected</span>
                <b className="report-simple-value">{inr(revenue ? (revenue.totals?.gstAmount ?? 0) : 0)}</b>
              </div>
              <div className="report-simple-row">
                <span className="report-simple-label">Discount</span>
                <b className="report-simple-value">{inr(revenue ? (revenue.totals?.discountAmount ?? 0) : 0)}</b>
              </div>
            </div>

            <div className="report-highlight-row" style={{ marginTop: 12 }}>
              <span className="report-highlight-label">Total Revenue</span>
              <b className="report-highlight-value">{inr(revenue ? (revenue.totals?.total ?? 0) : 0)}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Preserved Daily Breakdown for Occupancy */}
      {occupancy?.days?.length > 0 && (
        <div className="panel" style={{ marginTop: 2 }}>
          <div className="ph" style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle, #F1F5F9)' }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Daily Occupancy</h2>
            <span className="muted" style={{ fontSize: 11.5 }}>{periodLabel}</span>
          </div>
          <div className="tw">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="r">Occupied</th>
                  <th className="r">Occupancy %</th>
                </tr>
              </thead>
              <tbody>
                {occupancy.days.map((d) => (
                  <tr key={d.date}>
                    <td>{fd(d.date)}</td>
                    <td className="r mono">
                      {d.occupied}/{d.total}
                    </td>
                    <td className="r mono">{d.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
