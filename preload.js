const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("printerAPI", {
  printQr: (payload) => ipcRenderer.invoke("print-qr", payload),
  printPreviewDialog: () => ipcRenderer.invoke("print-preview-dialog"),
  listPrinters: () => ipcRenderer.invoke("list-printers"),
});
