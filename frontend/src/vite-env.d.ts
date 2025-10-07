/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module 'react-mentions-continued';

interface ImportMetaEnv {
  readonly VITE_AGENT_EDITOR_ENABLED?: string;
  readonly VITE_AGENT_EDITOR_STORAGE_KEY?: string;
  readonly VITE_AGENT_EDITOR_DEFAULT_NAME?: string;
  readonly VITE_AGENT_EDITOR_DEFAULT_ROLE?: string;
  readonly VITE_AGENT_EDITOR_AUTOSAVE_DELAY_MS?: string;
  readonly VITE_AGENT_EDITOR_API_BASE_URL?: string;
  readonly VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED?: string;
  readonly VITE_AGENT_EDITOR_REMOTE_PUBLISH_CONFIRMATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
