const { app, BrowserWindow } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('enable-experimental-web-platform-features');

function createWindow () {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: 'iDotMatrix Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
}

function grantPermission (wc, permission) {
  const allowed = ['bluetooth', 'bluetooth-private', 'clipboard-read', 'clipboard-sanitized-write'];
  return allowed.includes(permission);
}

app.whenReady().then(() => {
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(grantPermission(wc, permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => grantPermission(wc, permission));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
