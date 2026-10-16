// updater.js — Electron ana sürecinde kullanılır (main.js ile aynı klasöre koyun).
// Uygulama açılınca ve her 30 dakikada bir GitHub Releases'e bakar.
// Yeni sürüm varsa arayüze haber verir; kullanıcı "Güncelle"ye basınca indirir ve kurar.
const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

function setupUpdater(getWin) {
  if (!app.isPackaged) return // geliştirme modunda çalışmaz

  autoUpdater.autoDownload = false          // kullanıcı onaylamadan indirme
  autoUpdater.autoInstallOnAppQuit = false

  let last = null
  const send = (p) => {
    last = p
    const w = getWin()
    if (w && !w.isDestroyed()) w.webContents.send('update', p)
  }
  const check = () => autoUpdater.checkForUpdates().catch(() => {})

  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', () => {
    send({ state: 'installing' })
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 800) // kur ve yeniden aç
  })
  autoUpdater.on('error', (e) => send({ state: 'error', message: String((e && e.message) || e) }))

  // Arayüz açıldığında son durumu tekrar gönder, yoksa kontrol et
  ipcMain.handle('update:check', () => {
    if (last && last.state !== 'none') { send(last); return }
    return check()
  })
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().catch((e) => send({ state: 'error', message: String(e) })))

  setTimeout(check, 3000)
  setInterval(check, 30 * 60 * 1000)
}

module.exports = { setupUpdater }
