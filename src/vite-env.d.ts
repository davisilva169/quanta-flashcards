/// <reference types="vite/client" />

interface Window {
  quanta?: {
    platform: string;
    versions: NodeJS.ProcessVersions;
  };
}
