/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BTS_API_BASE: string;
  readonly VITE_BTS_WS_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
