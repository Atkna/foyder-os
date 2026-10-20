const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { createStore, defaultSettings } = require('./store');

const APP_NAME = 'Hafıza';
const ICON_ICO = path.join(__dirname, 'assets', 'icon.ico');
const ICON_PNG = path.join(__dirname, 'assets', 'icon.png');

// Veriler .exe dosyasının yerinden bağımsız olarak hep aynı klasörde durur (1.0 ve 1.1 ile ortak).
const dataDir = process.env.HAFIZA_DATA_DIR || path.join(app.getPath('appData'), 'hafiza-desktop');
app.setPath('userData', dataDir);
// Kurulum yapılmayan taşınabilir .exe için Windows bildirimleri ancak bu kimlikle güvenilir çalışır.
app.setAppUserModelId(APP_NAME);

const store = createStore(dataDir);
const uiStateFile = path.join(dataDir, 'pencere-durumu.json');
const startHidden = process.argv.includes('--hidden');
// Taşınabilir .exe her açılışta geçici klasöre açılır; kalıcı yol bu ortam değişkenindedir.
const launchPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let settings = defaultSettings();
let uiState = {};
const liveNotifications = new Set();

function loadUiState() {
  try { uiState = JSON.parse(fs.readFileSync(uiStateFile, 'utf8')) || {}; } catch (_) { uiState = {}; }
}

function saveUiState() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(uiStateFile, JSON.stringify(uiState, null, 2), 'utf8');
  } catch (_) { /* Pencere konumu kaydedilemese de uygulama çalışmalı. */ }
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

// Kayıtlı pencere konumu hâlâ bağlı bir ekranın içindeyse kullan.
function savedBounds() {
  const bounds = uiState.bounds;
  if (!bounds || !(bounds.width >= 1100) || !(bounds.height >= 700)) return {};
  const area = screen.getDisplayMatching(bounds).workArea;
  const visible = bounds.x < area.x + area.width - 120 && bounds.x + bounds.width > area.x + 120 && bounds.y >= area.y - 10 && bounds.y < area.y + area.height - 80;
  return visible ? bounds : { width: bounds.width, height: bounds.height };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    ...savedBounds(),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#f5f5f0',
    title: APP_NAME,
    icon: ICON_ICO,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Pencere gizliyken de hatırlatma denetimi (30 sn) yavaşlatılmadan sürsün.
      backgroundThrottling: false
    }
  });
  if (uiState.maximized) mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => { if (!startHidden) mainWindow.show(); });

  // Pencereye sürüklenen dosya veya bağlantı uygulama arayüzünün yerine açılmasın.
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('context-menu', (_, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { label: 'Kes', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Kopyala', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Yapıştır', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Tümünü seç', role: 'selectAll' }
      );
    } else if (params.selectionText.trim()) {
      template.push({ label: 'Kopyala', role: 'copy' });
    }
    if (template.length) Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  const rememberBounds = () => {
    if (!mainWindow || mainWindow.isMinimized()) return;
    uiState.maximized = mainWindow.isMaximized();
    if (!uiState.maximized) uiState.bounds = mainWindow.getBounds();
  };
  mainWindow.on('resize', rememberBounds);
  mainWindow.on('move', rememberBounds);
  // Uzun süre gizli kalan pencere açıldığında "Bugün" gibi tarihe bağlı görünümler yenilensin.
  mainWindow.on('show', () => mainWindow.webContents.send('app:refresh'));
  mainWindow.on('focus', () => mainWindow.webContents.send('app:refresh'));

  mainWindow.on('close', (event) => {
    rememberBounds();
    saveUiState();
    if (isQuitting || settings.minimizeToTray === false) return;
    event.preventDefault();
    mainWindow.hide();
    // Arka planda çalıştığını yalnızca ilk seferde haber ver.
    if (!uiState.trayHintShown && Notification.isSupported()) {
      uiState.trayHintShown = true;
      saveUiState();
      notify({ title: 'Hafıza arka planda çalışıyor', body: 'Hatırlatmalar sürüyor. Açmak için sistem tepsisindeki simgeye çift tıklayın.' });
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  tray = new Tray(ICON_ICO);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Hafıza’yı aç', click: showWindow },
    { type: 'separator' },
    { label: 'Tamamen kapat', click: quitApp }
  ]));
  tray.on('double-click', showWindow);
  tray.on('click', showWindow);
}

function notify({ title, body, taskId }) {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title, body, icon: ICON_PNG, silent: settings.reminderSound === false });
  // Nesne bellekten atılırsa tıklama olayı gelmez; kapanana kadar tut.
  liveNotifications.add(notification);
  const release = () => liveNotifications.delete(notification);
  notification.on('click', () => {
    release();
    showWindow();
    if (taskId && mainWindow) mainWindow.webContents.send('task:open', taskId);
  });
  notification.on('close', release);
  notification.on('failed', release);
  if (liveNotifications.size > 40) liveNotifications.delete(liveNotifications.values().next().value);
  notification.show();
  return true;
}

async function exportData() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Hafıza yedeğini kaydet',
    defaultPath: `Hafiza-Yedek-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, JSON.stringify(store.read().data, null, 2), 'utf8');
  return { saved: true, path: result.filePath };
}

async function importData() {
  const pick = await dialog.showOpenDialog(mainWindow, {
    title: 'Geri yüklenecek Hafıza yedeğini seç',
    defaultPath: fs.existsSync(store.snapshots) ? store.snapshots : undefined,
    filters: [{ name: 'JSON', extensions: ['json', 'bak'] }],
    properties: ['openFile']
  });
  if (pick.canceled || !pick.filePaths.length) return { restored: false };
  const incoming = store.peek(pick.filePaths[0]);
  if (!incoming) return { restored: false, error: 'Seçilen dosya geçerli bir Hafıza yedeği değil.' };
  const saved = incoming.updatedAt ? new Date(incoming.updatedAt).toLocaleString('tr-TR') : 'bilinmiyor';
  const answer = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Yedekten geri yükle',
    message: 'Mevcut veriler bu yedekle değiştirilsin mi?',
    detail: `Yedekte ${incoming.tasks.length} görev ve ${incoming.transcripts.length} deşifre var (son kayıt: ${saved}).\n\nŞu anki verileriniz silinmez; "yedekler" klasörüne ayrıca kopyalanır.`,
    buttons: ['Geri yükle', 'Vazgeç'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (answer.response !== 0) return { restored: false };
  const data = store.restore(pick.filePaths[0]);
  settings = data.settings;
  return { restored: true, data };
}

// Windows oturumu açılınca tepside başlatma. Yalnızca paketlenmiş .exe için anlamlıdır.
const loginOptions = () => ({ path: launchPath, args: ['--hidden'], name: APP_NAME });
function autostartState() {
  if (!app.isPackaged) return { supported: false, enabled: false };
  return { supported: true, enabled: app.getLoginItemSettings(loginOptions()).openAtLogin };
}
function setAutostart(enabled) {
  if (!app.isPackaged) return autostartState();
  app.setLoginItemSettings({ ...loginOptions(), openAtLogin: Boolean(enabled) });
  uiState.autostart = Boolean(enabled);
  saveUiState();
  return autostartState();
}

function registerIpc() {
  ipcMain.handle('data:load', () => {
    const result = store.read();
    settings = result.data.settings;
    return result;
  });
  ipcMain.handle('data:save', (_, payload) => {
    const value = store.write(payload);
    settings = value.settings;
    return value.updatedAt;
  });
  ipcMain.handle('sample:load', () => fs.readFileSync(path.join(__dirname, 'sample-transcript.txt'), 'utf8'));
  ipcMain.handle('notify', (_, payload) => notify(payload || {}));
  ipcMain.handle('data:location', () => store.file);
  ipcMain.handle('data:open-folder', () => fs.existsSync(store.file) ? shell.showItemInFolder(store.file) : shell.openPath(dataDir));
  ipcMain.handle('data:export', () => exportData());
  ipcMain.handle('data:import', () => importData());
  ipcMain.handle('autostart:get', () => autostartState());
  ipcMain.handle('autostart:set', (_, enabled) => setAutostart(enabled));
  ipcMain.handle('app:info', () => ({ version: require('./package.json').version }));
  ipcMain.handle('app:quit', () => quitApp());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { isQuitting = true; });
  // Pencere yalnızca "arka planda çalış" kapalıyken veya çıkışta gerçekten kapanır; o zaman uygulama da kapanmalı.
  app.on('window-all-closed', quitApp);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    loadUiState();
    // .exe başka klasöre taşındıysa otomatik başlatma kaydını yeni konuma güncelle.
    if (uiState.autostart && app.isPackaged && !autostartState().enabled) setAutostart(true);
    registerIpc();
    createWindow();
    createTray();
  });
}

module.exports = { getWindow: () => mainWindow, dataDir };
