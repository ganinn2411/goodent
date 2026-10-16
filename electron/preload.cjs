const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('goodent', {
  printHtml: (html, opts) => ipcRenderer.invoke('print-html', html, opts),
  // Güncelleme bildirimi (main.cjs > setupAutoUpdate ile çalışır)
  onUpdate: (cb) => {
    const h = (_e, p) => cb(p)
    ipcRenderer.on('update', h)
    return () => ipcRenderer.removeListener('update', h)
  },
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
})
