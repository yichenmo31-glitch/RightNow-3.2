import client from './client';

export interface TodoItem {
  id: string;
  title: string;
  category: string;
  date: string;
  completed: boolean;
}

export const todosApi = {
  async list(date?: string): Promise<TodoItem[]> {
    const params: Record<string, string> = {};
    if (date) params.date = date;
    const { data } = await client.get<TodoItem[]>('/todos', { params });
    return data;
  },

  async create(body: { title: string; category: string; date: string }): Promise<TodoItem> {
    const { data } = await client.post<TodoItem>('/todos', body);
    return data;
  },

  async update(id: string, body: { title?: string; category?: string; completed?: boolean }): Promise<TodoItem> {
    const { data } = await client.patch<TodoItem>(`/todos/${id}`, body);
    return data;
  },

  async toggle(id: string): Promise<TodoItem> {
    const { data } = await client.patch<TodoItem>(`/todos/${id}/toggle`);
    return data;
  },

  async remove(id: string): Promise<void> {
    await client.delete(`/todos/${id}`);
  },
};
