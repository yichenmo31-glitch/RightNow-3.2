import client from './client';

export interface Friendship {
  id: string;
  user: { id: string; name: string; avatar?: string };
  status: 'pending' | 'accepted';
  createdAt: string;
}

export const friendshipsApi = {
  async list(): Promise<Friendship[]> {
    const { data } = await client.get<Friendship[]>('/friendships');
    return data;
  },

  async request(receiverId: string): Promise<Friendship> {
    const { data } = await client.post<Friendship>('/friendships/request', { receiverId });
    return data;
  },

  async accept(id: string): Promise<Friendship> {
    const { data } = await client.patch<Friendship>(`/friendships/${id}/accept`);
    return data;
  },

  async remove(id: string): Promise<void> {
    await client.delete(`/friendships/${id}`);
  },
};
