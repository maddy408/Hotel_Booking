import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, BASE_URL, getTokens } from '../lib/apiClient';

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
 * expo-image-picker/expo-document-picker results shaped as { uri, name, type } —
 * React Native's FormData/fetch understands that exact shape natively for multipart upload.
 */
export function useUploadStayDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stayId, files, occupantTargets = [] }) => {
      const form = new FormData();
      for (const file of files) {
        form.append('documents[]', file);
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
 * safe to pass to <Image>, a PDF viewer, or Sharing.shareAsync.
 */
export async function fetchOccupantDocumentLocalFile(docId, suggestedName) {
  const tokens = getTokens();
  const dest = FileSystem.cacheDirectory + (suggestedName || `document-${docId}`);
  const result = await FileSystem.downloadAsync(occupantDocumentFileUrl(docId), dest, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (result.status !== 200) {
    throw new Error('Could not load the document. Access denied or file missing.');
  }
  return { uri: result.uri, mime: result.headers?.['content-type'] || result.headers?.['Content-Type'] };
}

export async function shareOccupantDocument(docId, suggestedName) {
  const { uri, mime } = await fetchOccupantDocumentLocalFile(docId, suggestedName);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: suggestedName || 'Document' });
  }
  return uri;
}
