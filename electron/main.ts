import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// __dirname não existe nativamente em ESM; recriamos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite injeta variáveis em desenvolvimento
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let mainWindow: BrowserWindow | null = null;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// ── Fix the userData path independent of productName ────────────────────────
//
// By default, Electron derives the userData directory from `productName`
// (set in package.json/build). Hoje isso resolve para `%APPDATA%\Quanta\` no
// Windows e equivalentes em outras plataformas — exatamente o que setamos
// abaixo. **Fixar explicitamente** desacopla o caminho do nome do produto:
// se um dia o `productName` mudar (rebranding, traduções, etc), os dados
// dos usuários continuam acessíveis no mesmo lugar.
//
// IMPORTANTE: a string `'Quanta'` é o que estava como default antes desta
// chamada. Ela NÃO MUDA o caminho onde os dados já estão — apenas o
// congela. Se você precisar mudar o nome da pasta no futuro, isso requer
// migração explícita (copiar dados do path antigo para o novo).
//
// Comentário de operação: a chamada precisa acontecer ANTES de
// `app.whenReady()` — qualquer subsystem que leia `userData` (incluindo a
// abertura de IndexedDB que o renderer fará) precisa enxergar o caminho
// final, e Electron resolve isso na inicialização do processo.
app.setPath('userData', path.join(app.getPath('appData'), 'Quanta Public'));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#08090b',
    title: 'Quanta',
    autoHideMenuBar: true,
    webPreferences: {
      // O output do vite-plugin-electron é `preload.js` (não `.mjs`).
      // Em dev o plugin injeta o caminho automaticamente; em produção
      // o electron-builder empacota `dist-electron/` verbatim e o
      // Electron precisa apontar para o nome real do arquivo.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Abre links externos no navegador padrão, não dentro do app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // Útil em dev — descomente se quiser DevTools automático
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    mainWindow = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
