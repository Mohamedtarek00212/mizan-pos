import { apiRequest } from '../../shared/api/apiClient';

export interface Category {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

/**
 * Categories API client (Step 5 B3, Step 6 §5.13). No delete/deactivate
 * path exists - only create + rename, matching the approved design.
 */
export const categoriesApi = {
  list(): Promise<{ categories: Category[] }> {
    return apiRequest('/categories');
  },

  create(name: string): Promise<Category> {
    return apiRequest('/categories', { method: 'POST', body: { name } });
  },

  rename(id: number, name: string): Promise<Category> {
    return apiRequest(`/categories/${id}`, { method: 'PATCH', body: { name } });
  },
};
