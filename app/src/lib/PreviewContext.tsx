import { createContext, useContext } from 'react';

interface PreviewContextValue {
  previewClientId: string | null;
}

export const PreviewContext = createContext<PreviewContextValue>({ previewClientId: null });

export function usePreviewClient(): string | null {
  return useContext(PreviewContext).previewClientId;
}
