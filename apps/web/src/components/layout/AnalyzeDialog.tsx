import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input, Label } from '@/components/ui/Field';
import { ErrorNote } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { errorText, useAnalyzeMutation } from '@/store/api';

const Ctx = createContext<{ openAnalyze: () => void } | null>(null);

export function useAnalyzeDialog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAnalyzeDialog must be used inside AnalyzeProvider');
  return ctx;
}

const EMPTY = { businessName: '', website: '', city: '', country: '', rating: '', reviewCount: '' };

export function AnalyzeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [analyze, { isLoading }] = useAnalyzeMutation();
  const navigate = useNavigate();
  const toast = useToast();

  const openAnalyze = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openAnalyze }), [openAnalyze]);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const rating = form.rating.trim() === '' ? undefined : Number(form.rating);
    const reviewCount = form.reviewCount.trim() === '' ? undefined : Number(form.reviewCount);
    if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      return setError('Rating must be a number from 0 to 5.');
    }
    if (reviewCount !== undefined && (!Number.isInteger(reviewCount) || reviewCount < 0)) {
      return setError('Review count must be a whole number, 0 or more.');
    }
    try {
      const res = await analyze({
        businessName: form.businessName.trim(),
        website: form.website.trim(),
        city: form.city.trim() || undefined,
        country: form.country.trim() || undefined,
        rating,
        reviewCount,
      }).unwrap();
      setOpen(false);
      setForm(EMPTY);
      toast.success('Analysis queued. It usually takes 30 to 60 seconds.');
      navigate(`/leads/${res.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Analyze a website"
          description="We check the site, score the opportunity and show the evidence. Nothing is sent to the business."
        >
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="a-name">Business name</Label>
              <Input
                id="a-name"
                required
                maxLength={200}
                value={form.businessName}
                onChange={set('businessName')}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="a-site">Website</Label>
              <Input
                id="a-site"
                required
                placeholder="example-rentals.com"
                value={form.website}
                onChange={set('website')}
                inputMode="url"
                autoCapitalize="none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="a-city" hint="optional">
                  City
                </Label>
                <Input id="a-city" value={form.city} onChange={set('city')} />
              </div>
              <div>
                <Label htmlFor="a-country" hint="optional">
                  Country
                </Label>
                <Input id="a-country" value={form.country} onChange={set('country')} />
              </div>
              <div>
                <Label htmlFor="a-rating" hint="optional">
                  Google rating
                </Label>
                <Input
                  id="a-rating"
                  inputMode="decimal"
                  placeholder="4.6"
                  value={form.rating}
                  onChange={set('rating')}
                />
              </div>
              <div>
                <Label htmlFor="a-reviews" hint="optional">
                  Review count
                </Label>
                <Input
                  id="a-reviews"
                  inputMode="numeric"
                  placeholder="180"
                  value={form.reviewCount}
                  onChange={set('reviewCount')}
                />
              </div>
            </div>
            <p className="text-[13px] text-ink-3">
              Rating and review count feed the business appeal part of the score. Leave them empty
              if you do not know them.
            </p>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={isLoading}>
                Analyze website
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
