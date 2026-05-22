// Preload roda num contexto isolado entre o renderer e o main process.
// Mantemos minimalista: o app é local-first e usa IndexedDB no renderer,
// então não precisamos expor APIs sensíveis aqui.
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('quanta', {
  platform: process.platform,
  versions: process.versions,
});
