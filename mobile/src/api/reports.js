import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { api, BASE_URL, getTokens } from '../lib/apiClient';

import { addDaysIso, fd, inr, todayIso } from '../lib/format';

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

/**
 * Downloads the invoices CSV from the server and saves it to the Android Downloads folder
 * using Expo's Storage Access Framework (SAF), without opening the Android Share menu.
 *
 * Preserves all backend columns, formatting, and date filters.
 */
export async function downloadInvoicesCsv(from, to, customFilename) {
  const tokens = getTokens();
  const url = `${BASE_URL}/reports/invoices.csv?from=${from}&to=${to}`;
  const filename =
    customFilename ||
    (from === to
      ? `KKK_Lodge_Invoices_${from}.csv`
      : `KKK_Lodge_Invoices_${from}_to_${to}.csv`);

  const dest = FileSystem.cacheDirectory + filename;

  const result = await FileSystem.downloadAsync(url, dest, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });

  if (result.status !== 200) {
    throw new Error('Could not export the CSV.');
  }

  let savedUri = result.uri;
  let savedToDownloads = false;

  const SAF_DOWNLOADS_KEY = 'tc_saf_downloads_uri';

  // On Android, save the generated CSV to the public Downloads folder via SAF
  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    const csvContent = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const baseName = filename.replace(/\.csv$/i, '');

    let saved = false;
    let targetDirectoryUri = null;

    // Check if user previously granted directory access to avoid repeatedly prompting
    try {
      targetDirectoryUri = await AsyncStorage.getItem(SAF_DOWNLOADS_KEY);
    } catch {
      targetDirectoryUri = null;
    }

    if (targetDirectoryUri) {
      try {
        const safUri = await FileSystem.StorageAccessFramework.createFileAsync(
          targetDirectoryUri,
          baseName,
          'text/csv'
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(safUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        savedUri = safUri;
        savedToDownloads = true;
        saved = true;
      } catch {
        // Cached directory permission may have expired or revoked; will re-prompt below
        saved = false;
      }
    }

    if (!saved) {
      let initialUri = null;
      try {
        initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
      } catch {
        // Fallback if getUriForDirectoryInRoot is not supported on older versions
        initialUri = null;
      }

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (!permissions.granted) {
        throw new Error('Storage permission not granted. Download cancelled.');
      }

      // Cache directory URI for automatic future downloads without repeated folder picker
      try {
        await AsyncStorage.setItem(SAF_DOWNLOADS_KEY, permissions.directoryUri);
      } catch {}

      const safUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        baseName,
        'text/csv'
      );

      await FileSystem.StorageAccessFramework.writeAsStringAsync(safUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      savedUri = safUri;
      savedToDownloads = true;
    }
  } else {
    // Non-Android platforms (iOS/web): file is saved in app document/cache storage
    savedToDownloads = true;
  }

  return {
    uri: savedUri,
    localCacheUri: result.uri,
    filename,
    savedToDownloads,
  };
}

/**
 * Opens a CSV file using Android's native viewer (e.g. Google Sheets, Microsoft Excel,
 * or default CSV viewer) via Expo File.preview (Intent.ACTION_VIEW), without sharing.
 */
export async function openDownloadedCsv(fileUri) {
  try {
    const file = new File(fileUri);
    await File.preview(file, { mimeType: 'text/csv' });
    return true;
  } catch (err) {
    throw new Error(
      err?.message || 'No compatible app found to open CSV. Please ensure a spreadsheet or CSV viewer app is installed.'
    );
  }
}
