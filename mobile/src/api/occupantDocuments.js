import { Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, BASE_URL, getTokens } from '../lib/apiClient';

const MIME_EXT_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export function occupantDocumentFileUrl(docId) {
  return `${BASE_URL}/occupant-documents/${docId}/file`;
}

export function useStayDocuments(stayId) {
  return useQuery({
    queryKey: ['stay-documents', stayId],
    queryFn: () => api.get(`/stays/${stayId}/documents`),
    enabled: !!stayId,
  });
}

/**
 * Web passes browser File objects straight into FormData. On RN, the caller passes
 * expo-document-picker results shaped as { uri, name, type } —
 * React Native's FormData/fetch understands that exact shape natively for multipart upload.
 */
export function useUploadStayDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stayId, files, occupantTargets = [] }) => {
      const form = new FormData();
      for (const file of files) {
        let uri = file.uri || '';
        if (Platform.OS === 'android') {
          if (uri.startsWith('file:/') && !uri.startsWith('file:///')) {
            uri = `file:///${uri.replace(/^file:\/*/, '')}`;
          } else if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
            uri = `file://${uri}`;
          }
        }
        const cleanName = (file.name || 'document.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = cleanName.split('.').pop().toLowerCase();
        const type = MIME_EXT_MAP[ext] || file.type || 'image/jpeg';
        form.append('documents[]', {
          uri,
          name: cleanName,
          type,
        });
      }
      if (occupantTargets.length > 0) {
        form.append('occupantTargets', JSON.stringify(occupantTargets));
      }
      return api.post(`/stays/${stayId}/documents`, form);
    },
    onSuccess: (_data, { stayId }) => {
      qc.invalidateQueries({ queryKey: ['stay', stayId] });
      qc.invalidateQueries({ queryKey: ['stay-documents', stayId] });
      qc.invalidateQueries({ queryKey: ['guests'] });
      qc.invalidateQueries({ queryKey: ['guest'] });
    },
  });
}

export function useDeleteOccupantDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId }) => api.delete(`/occupant-documents/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stay'] });
      qc.invalidateQueries({ queryKey: ['stay-documents'] });
      qc.invalidateQueries({ queryKey: ['guests'] });
      qc.invalidateQueries({ queryKey: ['guest'] });
    },
  });
}

/**
 * Downloads the protected document to the app's cache dir (adding the auth header,
 * which an <Image>/WebView request can't do) and returns a local file:// URI that's
 * safe to pass to <Image>, an in-app viewer, or Android document viewer.
 */
export async function fetchOccupantDocumentLocalFile(docId, suggestedName) {
  if (!docId) {
    throw new Error('Invalid document ID.');
  }

  const tokens = getTokens();
  const cleanSuggested = (suggestedName || `document-${docId}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = FileSystem.cacheDirectory + cleanSuggested;

  const result = await FileSystem.downloadAsync(occupantDocumentFileUrl(docId), dest, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });

  if (result.status === 404) {
    throw new Error('Document not found. The file may have been deleted or moved.');
  }
  if (result.status === 401 || result.status === 403) {
    throw new Error('Access denied. Please check your credentials or log in again.');
  }
  if (result.status !== 200) {
    throw new Error('Could not load the document. Server returned an error.');
  }

  // Verify file was written and is not 0 bytes
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || info.size === 0) {
    throw new Error('Downloaded document file is empty or missing.');
  }

  let mime = result.headers?.['content-type'] || result.headers?.['Content-Type'];
  if (!mime || mime === 'application/octet-stream') {
    const ext = cleanSuggested.split('.').pop()?.toLowerCase();
    if (ext && MIME_EXT_MAP[ext]) {
      mime = MIME_EXT_MAP[ext];
    }
  }

  return {
    uri: result.uri,
    mime: mime || 'application/octet-stream',
    filename: cleanSuggested,
    size: info.size,
  };
}

/**
 * Opens and displays the occupant document in the Android document viewer or appropriate
 * reading experience without showing the Share menu.
 *
 * For PDFs and documents, triggers Android's native viewer (e.g. Google Drive Viewer, Files,
 * Adobe Acrobat) via Expo File.preview with ACTION_VIEW intent.
 */
export async function viewOccupantDocument(docId, suggestedName) {
  const { uri, mime, filename } = await fetchOccupantDocumentLocalFile(docId, suggestedName);

  try {
    const file = new File(uri);
    await File.preview(file, { mimeType: mime });
    return { uri, mime, filename };
  } catch (err) {
    console.warn('Document viewer launch error:', err);
    throw new Error(
      err?.message ||
        `No application found to view this document format (${mime || 'unknown'}). Please install a compatible viewer app.`
    );
  }
}

/**
 * Explicit Share handler — only used when the user explicitly taps a Share action.
 */
export async function shareOccupantDocument(docId, suggestedName) {
  const { uri, mime } = await fetchOccupantDocumentLocalFile(docId, suggestedName);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: suggestedName || 'Document' });
  }
  return uri;
}
