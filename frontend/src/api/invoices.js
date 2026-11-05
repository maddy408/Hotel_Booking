import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useInvoiceByStay(stayId) {
  return useQuery({ queryKey: ['invoice-by-stay', stayId], queryFn: () => api.get(`/stays/${stayId}/invoice`), enabled: !!stayId });
}
