import { useQuery } from '@tanstack/react-query';
import { api, BASE_URL, getTokens } from '../lib/apiClient';

export function useTodayReport() {
  return useQuery({ queryKey: ['report-today'], queryFn: () => api.get('/reports/today'), refetchInterval: 60000 });
}

export function useDayEndReport(date) {
  return useQuery({ queryKey: ['report-day-end', date], queryFn: () => api.get(`/reports/day-end?date=${date}`) });
}

export function useOccupancyReport(from, to) {
  return useQuery({ queryKey: ['report-occupancy', from, to], queryFn: () => api.get(`/reports/occupancy?from=${from}&to=${to}`), enabled: !!from && !!to });
}

export function useRevenueReport(from, to) {
  return useQuery({ queryKey: ['report-revenue', from, to], queryFn: () => api.get(`/reports/revenue?from=${from}&to=${to}`), enabled: !!from && !!to });
}



/** CSV download isn't JSON, so it bypasses the api client's envelope handling. */
export async function downloadInvoicesCsv(from, to) {
  const tokens = getTokens();
  const res = await fetch(`${BASE_URL}/reports/invoices.csv?from=${from}&to=${to}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new Error('Could not export the CSV.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoices_${from}_to_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
