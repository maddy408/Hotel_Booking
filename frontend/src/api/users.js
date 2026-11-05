import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api.get('/users') });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles') });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (payload) => api.post('/users', payload), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/users/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: ({ id, password }) => api.post(`/users/${id}/reset-password`, { password }) });
}
