import client from './client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface PaginatedChat {
  data: ChatMessage[];
  total: number;
  page: number;
  limit: number;
}

export const chatApi = {
  async history(page = 1, limit = 20): Promise<PaginatedChat> {
    const { data } = await client.get<PaginatedChat>('/chat', { params: { page, limit } });
    return data;
  },

  async send(content: string): Promise<ChatMessage> {
    const { data } = await client.post<ChatMessage>('/chat', { content });
    return data;
  },
};
