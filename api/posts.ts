import client from './client';

export interface PostItem {
  id: string;
  content: string;
  images?: string[];
  tags?: string[];
  author: { id: string; name: string; avatar?: string };
  likes: number;
  liked: boolean;
  commentCount: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  content: string;
  author: { id: string; name: string; avatar?: string };
  createdAt: string;
}

export interface PaginatedPosts {
  data: PostItem[];
  total: number;
  page: number;
  limit: number;
}

export const postsApi = {
  async list(page = 1, limit = 10): Promise<PaginatedPosts> {
    const { data } = await client.get<PaginatedPosts>('/posts', { params: { page, limit } });
    return data;
  },

  async get(id: string): Promise<PostItem> {
    const { data } = await client.get<PostItem>(`/posts/${id}`);
    return data;
  },

  async create(body: { content: string; images?: string[]; tags?: string[] }): Promise<PostItem> {
    const { data } = await client.post<PostItem>('/posts', body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await client.delete(`/posts/${id}`);
  },

  async toggleLike(id: string): Promise<void> {
    await client.post(`/posts/${id}/like`);
  },

  async getComments(postId: string): Promise<Comment[]> {
    const { data } = await client.get<Comment[]>(`/posts/${postId}/comments`);
    return data;
  },

  async addComment(postId: string, content: string): Promise<Comment> {
    const { data } = await client.post<Comment>(`/posts/${postId}/comments`, { content });
    return data;
  },

  async removeComment(commentId: string): Promise<void> {
    await client.delete(`/comments/${commentId}`);
  },
};
