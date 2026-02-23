const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("printerAPI", {
  printQr: (payload) => ipcRenderer.invoke("print-qr", payload),
});
