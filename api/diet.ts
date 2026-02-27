import client from './client';

export interface DietRecord {
  id: string;
  name: string;
  calories: number;
  fat?: number;
  protein?: number;
  carbs?: number;
  date: string;
  mealType?: string;
}

export interface DietSummary {
  totalCalories: number;
  totalFat: number;
  totalProtein: number;
  totalCarbs: number;
}

export const dietApi = {
  async list(date?: string): Promise<DietRecord[]> {
    const params: Record<string, string> = {};
    if (date) params.date = date;
    const { data } = await client.get<DietRecord[]>('/diet', { params });
    return data;
  },

  async summary(date?: string): Promise<DietSummary> {
    const params: Record<string, string> = {};
    if (date) params.date = date;
    const { data } = await client.get<DietSummary>('/diet/summary', { params });
    return data;
  },

  async create(body: { name: string; calories: number; fat?: number; protein?: number; carbs?: number; date: string; mealType?: string }): Promise<DietRecord> {
    const { data } = await client.post<DietRecord>('/diet', body);
    return data;
  },

  async update(id: string, body: Partial<DietRecord>): Promise<DietRecord> {
    const { data } = await client.put<DietRecord>(`/diet/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await client.delete(`/diet/${id}`);
  },
};
