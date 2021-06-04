const path = require("path");
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  console.warn('App already running');
	app.quit();
  return;
}

let mainWindow;
function createMainWindow () {
  // Create the browser window.
  const sess = session.fromPartition('persist:rcappstorage');
  const defaultUserAgent = sess.getUserAgent();
  const userAgent = defaultUserAgent.replace(`Electron/${process.versions.electron} `, '')
  sess.setUserAgent(userAgent);
  const webPreferences = {
    nodeIntegration: false,
    contextIsolation: false,
    session: sess,
    preload: path.join(__dirname, 'preload.js'),
    nativeWindowOpen: true,
    disableBlinkFeatures: 'AcceleratedSmallCanvases',
    enableRemoteModule: false,
  };
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    webPreferences,
    show: true,
    title: 'RingCentral (Community)',
    icon: path.join(__dirname, '/icons/32x32.png'),
  });
  if (process.env.DEBUG == 1) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.loadURL('https://app.ringcentral.com');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.indexOf('http') === 0 &&
      url.indexOf('https://v.ringcentral.com') === -1
    ) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return {
      action: 'allow',
    };
  });
  mainWindow.webContents.on('did-create-window', (childWindow) => {
    childWindow.webContents.setUserAgent(userAgent);
    childWindow.webContents.on('will-navigate', (e, url) => {
      e.preventDefault();
      if (url.indexOf('https://meetings.ringcentral.com') > -1) {
        shell.openExternal(url);
        childWindow.close();
        return;
      }
      childWindow.webContents.loadURL(url, { userAgent });
    });
  });
  sess.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = userAgent;
    callback({
      cancel: false,
      requestHeaders: details.requestHeaders
    });
  });
}

app.on('ready', createMainWindow);

app.on('second-instance', (e, commandLine, cwd) => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  mainWindow = null;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function showMainWindow() {
// On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
}

app.on('activate', () => {
  showMainWindow();
});

app.on('browser-window-created', (_, window) => {
  window.setMenu(null);
  if (process.env.DEBUG == 1) {
    window.openDevTools();
  }
});

ipcMain.on('show-notifications-count', (_, count) => {
  app.setBadgeCount(count);
});
