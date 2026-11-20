import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

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
 * Backend endpoint: GET /stays/{stayId}/invoice
 */
export function useInvoiceByStay(stayId) {
  return useQuery({
    queryKey: ['invoice-by-stay', stayId],
    queryFn: () => api.get(`/stays/${stayId}/invoice`),
    enabled: !!stayId,
  });
}

/**
 * Unified hook that safely retrieves the invoice using actual invoiceId, stayId, or generic id.
 */
export function useInvoiceData({ invoiceId, stayId, id }) {
  const actualInvoiceId = invoiceId || (stayId ? null : id);
  const actualStayId = stayId;

  const invoiceQuery = useInvoice(actualInvoiceId);
  const stayQuery = useInvoiceByStay(actualStayId);

  if (actualInvoiceId) {
    return invoiceQuery;
  }
  return stayQuery;
}
