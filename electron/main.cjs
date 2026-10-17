const { app, BrowserWindow, session, shell, Menu, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Tek pencere: uygulama ikinci kez açılırsa mevcut pencereyi öne getir
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let win = null

// ---- Güvenlik yardımcıları ----
// Uygulamanın kendi sayfası dışından (başka site, enjekte edilmiş içerik) gelen IPC çağrılarını reddet
const trusted = (e) => !!(e && e.senderFrame && /^file:\/\//i.test(e.senderFrame.url || ''))

// Her pencere için: başka adrese gitmeyi, <webview> eklemeyi ve izinsiz yeni pencere açmayı engelle
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (ev, url) => {
    if (!/^file:\/\//i.test(url)) {
      ev.preventDefault()
      if (/^https:/i.test(url)) shell.openExternal(url)
    }
  })
  contents.on('will-attach-webview', (ev) => ev.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})

// ---- Otomatik güncelleme (electron-updater) ----
// Güncelleme adresi package.json > build.publish içinde tanımlıdır.
// Açılışta ve her 30 dakikada bir kontrol eder. Yeni sürüm varsa uygulamanın içinde
// "Yeni sürüm var" çubuğu çıkar; kullanıcı "Güncelle"ye basınca indirilir, kurulur ve uygulama yeniden açılır.
let updLast = null
function sendUpdate(p) {
  updLast = p
  if (win && !win.isDestroyed()) win.webContents.send('update', p)
}

function setupAutoUpdate() {
  if (!app.isPackaged) return // geliştirme modunda çalışmasın
  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch (e) {
    console.error('electron-updater bulunamadı:', e.message)
    return
  }

  autoUpdater.autoDownload = false // kullanıcı "Güncelle"ye basana kadar indirme
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', () => {
    sendUpdate({ state: 'installing' })
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 800) // kur ve yeniden aç
  })
  autoUpdater.on('error', (e) => {
    console.error('Güncelleme hatası:', e && e.message)
    sendUpdate({ state: 'error', message: String((e && e.message) || e).split('\n')[0].slice(0, 200) })
  })

  const check = () => autoUpdater.checkForUpdates().catch(() => {})

  // Arayüz açılınca son durumu tekrar gönder (çubuk kaybolmasın), yoksa kontrol et
  ipcMain.handle('update:check', (e) => {
    if (!trusted(e)) return
    if (updLast && ['available', 'downloading', 'installing'].includes(updLast.state)) { sendUpdate(updLast); return }
    return check()
  })
  ipcMain.handle('update:download', (e) =>
    !trusted(e) ? undefined : autoUpdater.downloadUpdate().catch((e) => sendUpdate({ state: 'error', message: String((e && e.message) || e).split('\n')[0].slice(0, 200) }))
  )

  check()
  setInterval(check, 30 * 60 * 1000)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    title: 'Goodent Laboratuvar',
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  Menu.setApplicationMenu(null)

  // vite build çıktısı: dist/index.html (vite.config.js içinde base: './')
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // Dış bağlantıları varsayılan tarayıcıda aç
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => { win = null })
}

// Etiket yazdırma (50x30 mm): gizli pencerede HTML'i açıp yazdırır
ipcMain.handle('print-html', (e, html) =>
  new Promise((resolve) => {
    if (!trusted(e) || typeof html !== 'string' || html.length > 500000) {
      resolve({ ok: false, reason: 'reddedildi' })
      return
    }
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    w.webContents.once('did-finish-load', async () => {
      try {
        // QR resmi tamamen çözülsün
        await w.webContents.executeJavaScript(
          'Promise.all([...document.images].map(i => i.decode ? i.decode().catch(() => {}) : Promise.resolve()))'
        )
        await new Promise((r) => setTimeout(r, 300))
        // Sürücü sayfa boyutunu bozmasın diye önce 50x30 mm PDF üret (CSS @page boyutu geçerli)
        const pdf = await w.webContents.printToPDF({
          preferCSSPageSize: true,
          printBackground: true,
          margins: { marginType: 'none' },
        })
        const file = path.join(app.getPath('temp'), `goodent-etiket-${Date.now()}.pdf`)
        fs.writeFileSync(file, pdf)
        // PDF görüntüleyicide açılır: etiketi görürsün, oradan yazıcıya gönderirsin
        const err = await shell.openPath(file)
        resolve({ ok: !err, reason: err || '' })
      } catch (e) {
        resolve({ ok: false, reason: String(e) })
      } finally {
        w.close()
      }
    })
  })
)

if (gotLock) app.whenReady().then(() => {
  // Kamera (barkod/QR okutma) izni
  const ownPage = (url) => /^file:\/\//i.test(url || '')
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(['media', 'camera'].includes(permission) && ownPage(details && details.requestingUrl))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) =>
    ['media', 'camera'].includes(permission) && ownPage(origin)
  )

  createWindow()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
