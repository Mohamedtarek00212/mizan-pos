import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatNumber, formatPercent } from '../../i18n/formatters';
import { ApiError } from '../../shared/api/apiClient';
import { AlertBanner, Button, Card, FieldLabel, PageContainer, PageHeading, Spinner, StatusBadge, inputStyle } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/Icon';
import { Category, categoriesApi } from './categoriesApi';
import { Product, productsApi } from './productsApi';

interface FormState {
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  currentPrice: string;
  reorderThreshold: string;
}

const EMPTY_FORM: FormState = {
  sku: '',
  barcode: '',
  name: '',
  categoryId: '',
  currentPrice: '',
  reorderThreshold: '0',
};

/**
 * Product Create/Edit/Details screen (Step 6 §5.12). Category is
 * mandatory (client blocks submit, backend re-enforces); price/SKU/
 * barcode validation is always re-checked server-side regardless of what
 * this form already checks (Step 5 A2).
 */
export function ProductFormPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = params.id !== undefined && params.id !== 'new';
  const productId = isEditMode ? Number(params.id) : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    if (productId === null) return;
    setIsLoading(true);
    setError(null);
    try {
      const p = await productsApi.getById(productId);
      setProduct(p);
      setForm({
        sku: p.sku,
        barcode: p.barcode ?? '',
        name: p.name,
        categoryId: String(p.category_id),
        currentPrice: String(p.current_price),
        reorderThreshold: String(p.reorder_threshold),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('productForm.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    categoriesApi.list().then((res) => setCategories(res.categories));
  }, []);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);

    const categoryId = Number(form.categoryId);
    const currentPrice = Number(form.currentPrice);
    const reorderThreshold = Number(form.reorderThreshold);

    if (!form.categoryId) {
      setFormError(t('productForm.categoryRequired'));
      return;
    }
    if (Number.isNaN(currentPrice) || currentPrice < 0) {
      setFormError(t('productForm.priceInvalid'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && productId !== null) {
        await productsApi.update(productId, {
          name: form.name,
          category_id: categoryId,
          current_price: currentPrice,
          barcode: form.barcode || null,
          reorder_threshold: reorderThreshold,
        });
      } else {
        await productsApi.create({
          sku: form.sku,
          barcode: form.barcode || null,
          name: form.name,
          category_id: categoryId,
          current_price: currentPrice,
          reorder_threshold: reorderThreshold,
        });
      }
      navigate('/products');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('productForm.failedToSave'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeactivate(): Promise<void> {
    if (productId === null) return;
    try {
      await productsApi.deactivate(productId);
      await loadProduct();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('productForm.failedToDeactivate'));
    }
  }

  async function handleReactivate(): Promise<void> {
    if (productId === null) return;
    try {
      await productsApi.update(productId, { is_active: true });
      await loadProduct();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('productForm.failedToReactivate'));
    }
  }

  if (isLoading) return <div className="page-loading"><Spinner /> <span>{t('productForm.loading')}</span></div>;
  if (error) return <PageContainer><AlertBanner tone="danger">{error}</AlertBanner></PageContainer>;

  return (
    <PageContainer maxWidth={760}>
      <header className="section-page-header section-page-header--simple">
        <span className="section-page-header__icon"><Icon name="product" size={28} /></span>
        <div><PageHeading>{isEditMode ? t('productForm.editTitle') : t('productForm.newTitle')}</PageHeading><p>{t('productForm.subtitle')}</p></div>
      </header>
      <Card>
      {product && <div className="product-form-status"><StatusBadge tone={product.is_active ? 'success' : 'neutral'}>{product.is_active ? t('common.status.active') : t('common.status.deactivated')}</StatusBadge><span>{t('productForm.currentStockAndTax', { stock: formatNumber(product.current_stock, i18n.language), rate: product.effective_tax_rate_pct !== null ? formatPercent(product.effective_tax_rate_pct, i18n.language) : t('productForm.noneConfigured') })}</span></div>}
      <form onSubmit={handleSubmit} className="product-form-grid">
        <div className="form-field">
          <FieldLabel>{t('productForm.skuLabel')}</FieldLabel>
          <input
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            disabled={isEditMode}
            required
            style={inputStyle}
          />
        </div>
        <div className="form-field">
          <FieldLabel>{t('productForm.barcodeLabel')}</FieldLabel>
          <input
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div className="form-field form-field--wide">
          <FieldLabel>{t('productForm.nameLabel')}</FieldLabel>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            style={inputStyle}
          />
        </div>
        <div className="form-field form-field--wide">
          <FieldLabel>{t('productForm.categoryLabel')}</FieldLabel>
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            required
            style={inputStyle}
          >
            <option value="">{t('productForm.categoryPlaceholder')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <FieldLabel>{t('productForm.priceLabel')}</FieldLabel>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.currentPrice}
            onChange={(e) => setForm({ ...form, currentPrice: e.target.value })}
            required
            style={inputStyle}
          />
        </div>
        <div className="form-field">
          <FieldLabel>{t('productForm.reorderThresholdLabel')}</FieldLabel>
          <input
            type="number"
            min="0"
            value={form.reorderThreshold}
            onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })}
            style={inputStyle}
          />
        </div>

        {formError && <div className="form-field--wide"><AlertBanner tone="danger">{formError}</AlertBanner></div>}
        <div className="product-form-actions form-field--wide">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.actions.saving') : t('common.actions.save')}
        </Button>

        {isEditMode && product && (
          <Button
            type="button"
            variant="secondary"
            onClick={product.is_active ? handleDeactivate : handleReactivate}
          >
            {product.is_active ? t('common.actions.deactivate') : t('common.actions.reactivate')}
          </Button>
        )}
        </div>
      </form>
      </Card>
      <Link to="/products">{t('productForm.back')}</Link>
    </PageContainer>
  );
}
