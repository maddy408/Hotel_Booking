import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { BASE_URL, getTokens } from '../lib/apiClient';

export function idImageUrl(guestId) {
  return `${BASE_URL}/guests/${guestId}/id-image`;
}

/** `file` is an expo-image-picker/expo-document-picker result shaped as { uri, name, type }. */
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

/** Downloads the protected ID image to a local file so <Image source={{uri}}> can show it. */
export async function fetchIdImageLocalUri(guestId) {
  const tokens = getTokens();
  const dest = FileSystem.cacheDirectory + `id-image-${guestId}.jpg`;
  const result = await FileSystem.downloadAsync(idImageUrl(guestId), dest, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
  });
  if (result.status !== 200) throw new Error('Could not load the ID image.');
  return result.uri;
}
