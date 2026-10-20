import { createContext, useContext } from 'react';
import { emptyPro } from './model.ts';
import type { ProData } from './model.ts';
export const ProContext = createContext<{
  data: ProData;
  refresh: () => Promise<void>;
  configured: boolean;
  publicSharing?: boolean;
}>({ data: emptyPro(), refresh: async () => {}, configured: false });
export const usePro = () => useContext(ProContext);
