import { useQuery } from '@tanstack/react-query';
import { api, BASE_URL, getTokens } from '../lib/apiClient';
import { todayIso } from '../lib/format';

export function useTodayReport(from, to) {
  const queryStr = from && to ? `?from=${from}&to=${to}` : (from ? `?date=${from}` : '');
  const isCurrentDay = !from || from === todayIso();
  return useQuery({
    queryKey: ['report-today', from, to],
    queryFn: () => api.get(`/reports/today${queryStr}`),
    refetchInterval: isCurrentDay ? 60000 : false,
  });
}

export function useDayEndReport(from, to) {
  const queryStr = to ? `?from=${from}&to=${to}` : (from ? `?date=${from}` : '');
  return useQuery({
    queryKey: ['report-day-end', from, to],
    queryFn: () => api.get(`/reports/day-end${queryStr}`),
    enabled: !!from,
  });
}

export function useOccupancyReport(from, to) {
  return useQuery({ queryKey: ['report-occupancy', from, to], queryFn: () => api.get(`/reports/occupancy?from=${from}&to=${to}`), enabled: !!from && !!to });
}

export function useRevenueReport(from, to) {
  return useQuery({ queryKey: ['report-revenue', from, to], queryFn: () => api.get(`/reports/revenue?from=${from}&to=${to}`), enabled: !!from && !!to });
}

/** CSV download isn't JSON, so it bypasses the api client's envelope handling. */
export async function downloadInvoicesCsv(from, to, customFilename) {
  const tokens = getTokens();
  const res = await fetch(`${BASE_URL}/reports/invoices.csv?from=${from}&to=${to}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new Error('Could not export the CSV.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = customFilename || (from === to ? `KKK_Lodge_Invoices_${from}.csv` : `KKK_Lodge_Invoices_${from}_to_${to}.csv`);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
