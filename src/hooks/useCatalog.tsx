import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Catalog, Novel } from '@/types';
import { loadCatalog } from '@/services/catalog';

interface CatalogCtx {
  catalog: Catalog | null;
  novels: Novel[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<CatalogCtx>({
  catalog: null,
  novels: [],
  status: 'loading',
  error: null,
  reload: () => {},
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ catalog: Catalog | null; status: 'loading' | 'ready' | 'error'; error: string | null }>({
    catalog: null,
    status: 'loading',
    error: null,
  });
  const reloadToken = useRef(0);

  const fetchNow = useCallback(async (token: number) => {
    setState((s) => ({ ...s, status: s.catalog ? s.status : 'loading', error: null }));
    try {
      const catalog = await loadCatalog(token > 0);
      setState({ catalog, status: 'ready', error: null });
    } catch (e) {
      if (token !== reloadToken.current) return;
      setState({ catalog: null, status: 'error', error: e instanceof Error ? e.message : 'خطای نامشخص' });
    }
  }, []);

  useEffect(() => {
    reloadToken.current += 1;
    void fetchNow(reloadToken.current);
  }, [fetchNow]);

  const reload = useCallback(() => {
    reloadToken.current += 1;
    void fetchNow(reloadToken.current);
  }, [fetchNow]);

  const value = useMemo<CatalogCtx>(
    () => ({
      catalog: state.catalog,
      novels: state.catalog?.novels ?? [],
      status: state.status,
      error: state.error,
      reload,
    }),
    [state, reload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog(): CatalogCtx {
  return useContext(Ctx);
}
