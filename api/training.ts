import client from './client';

export interface TrainingRecord {
  id: string;
  description: string;
  duration?: number;
  photoUrl?: string;
  date: string;
}

export const trainingApi = {
  async list(date?: string): Promise<TrainingRecord[]> {
    const params: Record<string, string> = {};
    if (date) params.date = date;
    const { data } = await client.get<TrainingRecord[]>('/training', { params });
    return data;
  },

  async create(body: { description: string; duration?: number; photoUrl?: string; date: string }): Promise<TrainingRecord> {
    const { data } = await client.post<TrainingRecord>('/training', body);
    return data;
  },

  async update(id: string, body: Partial<TrainingRecord>): Promise<TrainingRecord> {
    const { data } = await client.put<TrainingRecord>(`/training/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await client.delete(`/training/${id}`);
  },
};
