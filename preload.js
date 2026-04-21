// ========== ELECTRON SECURITY CONTEXT ==========
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // ========== WINDOW CONTROLS ==========
  winMinimize: () => ipcRenderer.invoke("win:minimize"),
  winMaximizeToggle: () => ipcRenderer.invoke("win:maximizeToggle"),
  winClose: () => ipcRenderer.invoke("win:close"),

  // ========== AUTHENTICATION API ==========
  authMe: () => ipcRenderer.invoke("auth:me"),
  openDiscordLogin: () => ipcRenderer.invoke("auth:openDiscordLogin"),
  logout: () => ipcRenderer.invoke("auth:logout"),

  // ========== TRANSCRIPTS API ==========
  getTranscripts: () => ipcRenderer.invoke("transcripts:getList"),
  getTranscriptHtml: (id) => ipcRenderer.invoke("transcripts:getHtml", id)
});