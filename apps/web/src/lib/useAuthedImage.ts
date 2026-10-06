import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store';
import { API_BASE } from '@/store/api';

/**
 * Screenshots sit behind the bearer token, which an <img> tag cannot send. Fetch the file
 * with the header and hand the browser an object URL instead.
 */
export function useAuthedImage(path: string | null | undefined) {
  const token = useAppSelector((s) => s.auth.token);
  const [state, setState] = useState<{ url: string | null; loading: boolean; failed: boolean }>({
    url: null,
    loading: Boolean(path),
    failed: false,
  });

  useEffect(() => {
    if (!path || !token) {
      setState({ url: null, loading: false, failed: false });
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, failed: false });
    const safePath = path.split('/').map(encodeURIComponent).join('/');
    fetch(`${API_BASE}/api/uploads/${safePath}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, failed: false });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setState({ url: null, loading: false, failed: true });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, token]);

  return state;
}
