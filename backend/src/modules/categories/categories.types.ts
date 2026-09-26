export interface CategoryRow {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCategoryInput {
  name: string;
}

export interface UpdateCategoryInput {
  name: string;
}
