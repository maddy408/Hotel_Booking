import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getTokens } from '../lib/apiClient';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/tamarind-court/backend/public';

export function idImageUrl(guestId) {
  return `${BASE_URL}/guests/${guestId}/id-image`;
}

export function useUploadIdImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ guestId, file }) => {
      const tokens = getTokens();
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(idImageUrl(guestId), {
        method: 'POST',
        headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
        body: form,
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error?.message || 'Upload failed.');
      return payload.data;
    },
    onSuccess: (_data, { guestId }) => {
      qc.invalidateQueries({ queryKey: ['guest', guestId] });
      qc.invalidateQueries({ queryKey: ['guests'] });
    },
  });
}

/** Fetches the protected image as a blob URL (the <img> tag can't send an Authorization header). */
export async function fetchIdImageBlobUrl(guestId) {
  const tokens = getTokens();
  const res = await fetch(idImageUrl(guestId), {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (!res.ok) throw new Error('Could not load the ID image.');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
