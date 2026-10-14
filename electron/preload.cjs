const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('goodent', {
  printHtml: (html, opts) => ipcRenderer.invoke('print-html', html, opts),
})
