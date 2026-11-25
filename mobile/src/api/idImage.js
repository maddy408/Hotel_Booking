import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { api, BASE_URL, getTokens } from '../lib/apiClient';

export function idImageUrl(guestId) {
  return `${BASE_URL}/guests/${guestId}/id-image`;
}

/** `file` is an expo-document-picker result shaped as { uri, name, type }. */
export function useUploadIdImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ guestId, file }) => {
      const form = new FormData();
      form.append('image', file);
      return api.post(`/guests/${guestId}/id-image`, form);
    },
    onSuccess: (_data, { guestId }) => {
      qc.invalidateQueries({ queryKey: ['guest', guestId] });
      qc.invalidateQueries({ queryKey: ['guests'] });
    },
  });
}

export function useDeleteIdImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ guestId }) => {
      return api.delete(`/guests/${guestId}/id-image`);
    },
    onSuccess: (_data, { guestId }) => {
      qc.invalidateQueries({ queryKey: ['guest', guestId] });
      qc.invalidateQueries({ queryKey: ['guests'] });
    },
  });
}

const MIME_EXT_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** Downloads the protected ID document to a local file, detecting extension & MIME type. */
export async function fetchIdImageLocalFile(guestId) {
  const tokens = getTokens();
  const rawDest = FileSystem.cacheDirectory + `id-doc-temp-${guestId}`;
  const result = await FileSystem.downloadAsync(idImageUrl(guestId), rawDest, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (result.status !== 200) throw new Error('Could not load the ID document.');

  const contentType = (result.headers?.['content-type'] || result.headers?.['Content-Type'] || '').toLowerCase();
  let ext = 'jpg';
  let mime = 'image/jpeg';
  if (contentType.includes('pdf')) {
    ext = 'pdf';
    mime = 'application/pdf';
  } else if (contentType.includes('png')) {
    ext = 'png';
    mime = 'image/png';
  } else if (contentType.includes('webp')) {
    ext = 'webp';
    mime = 'image/webp';
  }

  const finalDest = FileSystem.cacheDirectory + `id-doc-${guestId}.${ext}`;
  try {
    await FileSystem.copyAsync({ from: result.uri, to: finalDest });
    return { uri: finalDest, mime, filename: `guest-${guestId}-id.${ext}` };
  } catch (_e) {
    return { uri: result.uri, mime, filename: `guest-${guestId}-id.${ext}` };
  }
}

/** Downloads the protected ID document to a local file and returns its URI. */
export async function fetchIdImageLocalUri(guestId) {
  const file = await fetchIdImageLocalFile(guestId);
  return file.uri;
}
