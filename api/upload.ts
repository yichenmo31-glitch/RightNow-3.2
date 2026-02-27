import client from './client';

export interface UploadResult {
  url: string;
}

export const uploadApi = {
  async upload(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await client.post<UploadResult>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async uploadAvatar(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await client.post<UploadResult>('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};
