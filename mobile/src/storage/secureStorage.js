import * as SecureStore from 'expo-secure-store';

// expo-secure-store keys must be alphanumeric/._- only.
const AUTH_KEY = 'tamarind_court_auth';

export async function loadTokens() {
  try {
    const raw = await SecureStore.getItemAsync(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens) {
  if (tokens) {
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(tokens));
  } else {
    await SecureStore.deleteItemAsync(AUTH_KEY);
  }
}
