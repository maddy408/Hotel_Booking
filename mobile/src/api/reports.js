import { useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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

/**
 * Web downloads the CSV via a browser `<a download>` link; on Android there's no such
 * thing, so this saves it to the app's cache dir and opens the native share/"open with"
 * sheet (the Files/Sheets/Drive app the user picks handles the actual save/open).
 */
export async function downloadInvoicesCsv(from, to) {
  const tokens = getTokens();
  const url = `${BASE_URL}/reports/invoices.csv?from=${from}&to=${to}`;
  const filename = `invoices_${from}_to_${to}.csv`;
  const dest = FileSystem.cacheDirectory + filename;

  const result = await FileSystem.downloadAsync(url, dest, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (result.status !== 200) {
    throw new Error('Could not export the CSV.');
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, { mimeType: 'text/csv', dialogTitle: filename });
  }
  return result.uri;
}
