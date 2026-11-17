import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

/** Fetches protected document with Authorization header as a blob URL for inline viewing/downloading */
export async function fetchOccupantDocumentBlob(docId) {
  const tokens = getTokens();
  const res = await fetch(occupantDocumentFileUrl(docId), {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) {
    throw new Error('Could not load the document. Access denied or file missing.');
  }
  const blob = await res.blob();
  const mime = res.headers.get('content-type') || blob.type;
  const contentDisp = res.headers.get('content-disposition') || '';
  let filename = 'document';
  const match = contentDisp.match(/filename="?([^";]+)"?/i);
  if (match?.[1]) {
    filename = match[1];
  }
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, blob, mime, filename };
}
