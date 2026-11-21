import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { buildProformaInvoiceData } from '../lib/proformaInvoice.js';

/**
 * Build a proforma / preview invoice object on the client if the backend
 * reports "No invoice for this stay yet." (e.g. active in-house stay).
 */
export async function fetchProformaInvoice(stayId, fallbackContext = {}) {
  let stay = fallbackContext?.stay;
  if (!stay || !stay.guest_name) {
    try {
      const fetchedStay = await api.get(`/stays/${stayId}`);
      stay = { ...(fetchedStay || {}), ...(stay || {}) };
    } catch {}
  }

  // Fetch bill and hotel settings in parallel
  const [billRes, settingsRes] = await Promise.all([
    api.get(`/stays/${stayId}/bill`).catch(() => null),
    api.get('/settings').catch(() => null),
  ]);

  return buildProformaInvoiceData({
    stay,
    bill: stay?.bill || billRes,
    hotel: settingsRes?.hotel,
    settings: settingsRes?.settings,
    guest: fallbackContext?.guest,
    stayId,
  });
}

/**
 * Retrieve invoice using its actual invoice ID.
 * Backend endpoint: GET /invoices/{id}
 */
export function useInvoice(invoiceId) {
  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.get(`/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });
}

/**
 * Retrieve invoice by stay ID.
 * Tries backend endpoint GET /stays/{stayId}/invoice first.
 * If backend returns 404 / 'No invoice for this stay yet', falls back to generating
 * an accurate proforma / interim invoice preview from stay, bill, and settings.
 */
export function useInvoiceByStay(stayId, fallbackContext = {}) {
  return useQuery({
    queryKey: ['invoice-by-stay', stayId],
    queryFn: async () => {
      try {
        return await api.get(`/stays/${stayId}/invoice`);
      } catch (err) {
        const isNotFound = err?.status === 404 || err?.message?.toLowerCase().includes('no invoice for this stay');
        if (isNotFound) {
          return await fetchProformaInvoice(stayId, fallbackContext);
        }
        throw err;
      }
    },
    enabled: !!stayId,
  });
}

/**
 * Unified hook that safely retrieves the invoice using actual invoiceId, stayId, or generic id.
 */
export function useInvoiceData({ invoiceId, stayId, id, stay, guest } = {}) {
  const actualInvoiceId = invoiceId || (stayId ? null : id);
  const actualStayId = stayId;

  const invoiceQuery = useInvoice(actualInvoiceId);
  const stayQuery = useInvoiceByStay(actualStayId, { stay, guest });

  if (actualInvoiceId) {
    return invoiceQuery;
  }
  return stayQuery;
}
