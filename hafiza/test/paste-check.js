// Menü çubuğu kaldırıldıktan sonra Ctrl+V / Ctrl+A / Ctrl+C kısayollarının çalıştığını doğrular.
// Panodaki metni geçici olarak değiştirir ve sonunda geri yükler.
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.HAFIZA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hafiza-paste-'));
const { app, clipboard } = require('electron');
const main = require('../main.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await app.whenReady();
  let win; for (let i = 0; i < 100 && !(win = main.getWindow()); i++) await sleep(50);
  const web = win.webContents;
  if (web.isLoading()) await new Promise(r => web.once('did-finish-load', r));
  await sleep(600); win.show(); win.focus(); await sleep(300);
  const saved = clipboard.readText();
  const key = (keyCode, modifiers = []) => { for (const type of ['keyDown', 'keyUp']) web.sendInputEvent({ type, keyCode, modifiers }); };
  try {
    clipboard.writeText('Yapıştırma denemesi: Kerem aranacak.');
    await web.executeJavaScript(`document.querySelector('#openTranscriptBtn').click(); setTimeout(() => document.querySelector('#transcriptText').focus(), 80);`);
    await sleep(400);
    key('V', ['control']); await sleep(400);
    const pasted = await web.executeJavaScript(`document.querySelector('#transcriptText').value`);
    console.log('CTRL+V ' + (pasted === 'Yapıştırma denemesi: Kerem aranacak.' ? 'GEÇTİ' : 'KALDI: ' + JSON.stringify(pasted)));
    console.log('sayaç: ' + await web.executeJavaScript(`document.querySelector('#transcriptStats').textContent`));
    clipboard.writeText('');
    key('A', ['control']); await sleep(150); key('C', ['control']); await sleep(300);
    console.log('CTRL+A, CTRL+C ' + (clipboard.readText() === 'Yapıştırma denemesi: Kerem aranacak.' ? 'GEÇTİ' : 'KALDI: ' + JSON.stringify(clipboard.readText())));
    // Ctrl+N: pencere açıkken devreye girmemeli; Escape onay sorar (confirm → true)
    await web.executeJavaScript(`window.confirm = () => true; closeModal('transcriptModal');`);
    key('N', ['control']); await sleep(300);
    console.log('CTRL+N ' + (await web.executeJavaScript(`!document.querySelector('#taskModal').classList.contains('hidden') && document.querySelector('#taskModalTitle').textContent === 'Yeni görev'`) ? 'GEÇTİ' : 'KALDI'));
    key('Escape'); await sleep(200);
    key('F', ['control']); await sleep(200);
    console.log('CTRL+F ' + (await web.executeJavaScript(`document.activeElement.id === 'searchInput'`) ? 'GEÇTİ' : 'KALDI'));
  } finally {
    clipboard.writeText(saved);
  }
  app.exit(0);
})().catch(e => { console.error(e); app.exit(1); });
