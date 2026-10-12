const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('goodent', {
  printHtml: (html) => ipcRenderer.invoke('print-html', html),
})
