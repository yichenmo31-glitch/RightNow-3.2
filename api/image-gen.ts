import apiClient from './client';

export interface ImageGenTask {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  sourceImageUrl?: string;
  targetStyle?: string;
  prompt?: string;
  resultImageUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export const imageGenApi = {
  create: (data: { sourceImageUrl?: string; targetStyle?: string; prompt?: string }) =>
    apiClient.post<ImageGenTask>('/api/image-gen', data).then(r => r.data),

  list: () =>
    apiClient.get<ImageGenTask[]>('/api/image-gen').then(r => r.data),

  get: (id: string) =>
    apiClient.get<ImageGenTask>(`/api/image-gen/${id}`).then(r => r.data),

  updateStatus: (id: string, data: { status: string; resultImageUrl?: string }) =>
    apiClient.patch<ImageGenTask>(`/api/image-gen/${id}`, data).then(r => r.data),
};
