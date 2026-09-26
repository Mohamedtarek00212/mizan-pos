import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../shared/api/apiClient';
import { AlertBanner, Button, Card, EmptyState, PageContainer, PageHeading, Spinner, inputStyle } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';
import { Category, categoriesApi } from './categoriesApi';

/**
 * Categories screen (Step 6 §5.13). No delete action exists - only
 * create + rename, matching the approved data model (categories have no
 * `is_active` column and `products.category_id` depends on them).
 */
export function CategoriesPage(): JSX.Element {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await categoriesApi.list();
      setCategories(res.categories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('categories.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);
    try {
      await categoriesApi.create(newName);
      setNewName('');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('categories.failedToCreate'));
    }
  }

  function startEdit(category: Category): void {
    setEditingId(category.id);
    setEditingName(category.name);
  }

  async function saveEdit(): Promise<void> {
    if (editingId === null) return;
    setFormError(null);
    try {
      await categoriesApi.rename(editingId, editingName);
      setEditingId(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('categories.failedToRename'));
    }
  }

  return (
    <PageContainer maxWidth={820}>
      <header className="section-page-header">
        <span className="section-page-header__icon"><Icon name="category" size={28} /></span>
        <div><PageHeading>{t('categories.title')}</PageHeading><p>{t('categories.subtitle')}</p></div>
      </header>

      <Card>
      <form onSubmit={handleCreate} className="category-create-form">
        <div><strong>{t('categories.addTitle')}</strong><small>{t('categories.addHint')}</small></div>
        <input
          aria-label={t('categories.newCategoryPlaceholder')}
          placeholder={t('categories.newCategoryPlaceholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={inputStyle}
          required
        />
        <Button type="submit" disabled={!newName.trim()}>{t('common.actions.add')}</Button>
      </form>
      </Card>
      {formError && <AlertBanner tone="danger">{formError}</AlertBanner>}

      {isLoading && <div className="page-loading"><Spinner /> <span>{t('categories.loading')}</span></div>}
      {error && <AlertBanner tone="danger">{error}</AlertBanner>}

      {!isLoading && !error && categories.length === 0 && <EmptyState>{t('categories.empty')}</EmptyState>}

      {!isLoading && !error && categories.length > 0 && (
        <div className="category-list">
          <div className="catalog-result-count">{t('categories.resultCount', { count: categories.length })}</div>
          {categories.map((c) => (
            <article key={c.id} className="category-row">
              <span className="category-row__icon"><Icon name="category" size={20} /></span>
              {editingId === c.id ? (
                <>
                  <input aria-label={t('categories.editingName')} value={editingName} onChange={(e) => setEditingName(e.target.value)} style={inputStyle} />
                  <Button onClick={saveEdit} disabled={!editingName.trim()}>{t('common.actions.save')}</Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>{t('common.actions.cancel')}</Button>
                </>
              ) : (
                <>
                  <strong>{c.name}</strong>
                  <Button variant="secondary" onClick={() => startEdit(c)}>{t('common.actions.rename')}</Button>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
