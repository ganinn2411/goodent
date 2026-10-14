const { app, BrowserWindow, session, shell, Menu, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Tek pencere: uygulama ikinci kez açılırsa mevcut pencereyi öne getir
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let win = null

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
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  Menu.setApplicationMenu(null)

  // vite build çıktısı: dist/index.html (vite.config.js içinde base: './')
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // Dış bağlantıları varsayılan tarayıcıda aç
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => { win = null })
}

// Yazdırma: HTML'i gizli pencerede PDF'e çevirip PDF görüntüleyicide açar.
//   opts.paper === 'a4'  -> fatura / ekstre (A4, kenar boşluklu, çok sayfalı)
//   aksi halde           -> etiket (50x30 mm; boyutu HTML içindeki CSS @page belirler)
ipcMain.handle('print-html', (_e, html, opts) =>
  new Promise((resolve) => {
    const a4 = !!opts && opts.paper === 'a4'
    const name = String((opts && opts.name) || (a4 ? 'fatura' : 'etiket')).replace(/[^a-z0-9_-]/gi, '') || 'yazdir'
    const stamp = Date.now()
    // A4 belgeler uzun olabilir (data: adresi ~2 MB ile sınırlı), bu yüzden geçici dosyadan yükle
    const tmpHtml = a4 ? path.join(app.getPath('temp'), `goodent-${name}-${stamp}.html`) : null
    if (a4) fs.writeFileSync(tmpHtml, html, 'utf8')

    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    if (a4) w.loadFile(tmpHtml)
    else w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    w.webContents.once('did-finish-load', async () => {
      try {
        // Resimler (QR vb.) tamamen çözülsün
        await w.webContents.executeJavaScript(
          'Promise.all([...document.images].map(i => i.decode ? i.decode().catch(() => {}) : Promise.resolve()))'
        )
        await new Promise((r) => setTimeout(r, 300))
        const pdf = await w.webContents.printToPDF(
          a4
            ? {
                pageSize: 'A4',
                printBackground: true,
                // marginType 'custom' değerleri inç cinsindendir (0.55 inç ≈ 14 mm)
                margins: { marginType: 'custom', top: 0.55, bottom: 0.55, left: 0.55, right: 0.55 },
              }
            : {
                // Sürücü sayfa boyutunu bozmasın diye önce 50x30 mm PDF üret (CSS @page boyutu geçerli)
                preferCSSPageSize: true,
                printBackground: true,
                margins: { marginType: 'none' },
              }
        )
        const file = path.join(app.getPath('temp'), `goodent-${name}-${stamp}.pdf`)
        fs.writeFileSync(file, pdf)
        // PDF görüntüleyicide açılır: oradan yazıcıya gönderir ya da kaydedersin
        const err = await shell.openPath(file)
        resolve({ ok: !err, reason: err || '' })
      } catch (e) {
        resolve({ ok: false, reason: String(e) })
      } finally {
        w.close()
        if (tmpHtml) fs.unlink(tmpHtml, () => {})
      }
    })
  })
)

app.whenReady().then(() => {
  // Kamera (barkod/QR okutma) izni
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'camera', 'mediaKeySystem'].includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'camera'].includes(permission)
  )

  createWindow()

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
