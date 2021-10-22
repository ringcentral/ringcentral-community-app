const path = require('path');
const { app, BrowserWindow, ipcMain, shell, session, Menu, Tray, globalShortcut } = require('electron');
const singleInstanceLock = app.requestSingleInstanceLock();

let enablePipeWire = false;
if (
  process.env.ORIGINAL_XDG_CURRENT_DESKTOP === 'GNOME' ||
  process.env.ORIGINAL_XDG_CURRENT_DESKTOP === 'KDE' ||
  process.env.ORIGINAL_XDG_CURRENT_DESKTOP === 'SWAY'
) {
  enablePipeWire = true;
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}

let mainWindow;
let tray;
let isQuiting;

function createTray(iconPath) {
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App', click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Quit', click: () => {
        app.quit();
      }
    },
  ]);
  tray.setToolTip('RingCentral Community App');
  tray.setContextMenu(contextMenu);
}

function createMainWindow() {
  // Create the browser window.
  const sess = session.fromPartition('persist:rcappstorage');
  const defaultUserAgent = sess.getUserAgent();
  let userAgent = defaultUserAgent.replace(`Electron/${process.versions.electron} `, '');
  if (enablePipeWire) {
    userAgent = `${userAgent} PipeWire`;
  }
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
  const iconPath = path.join(__dirname, 'icons', '16x16.png');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    webPreferences,
    show: true,
    title: 'RingCentral (Community)',
    icon: iconPath,
  });
  if (process.env.DEBUG == 1) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.loadURL('https://app.ringcentral.com');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.indexOf('http') === 0 &&
      url.indexOf('authorize') === -1 &&
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

  if (!tray) {
    createTray(iconPath);
  }
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      event.returnValue = false;
    }
  });
}

function showMainWindow() {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
}

if (!singleInstanceLock) {
  console.warn('App already running');
  app.quit();
} else {
  app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+Q', () => {
      app.quit();
    });
  }).then(createMainWindow);

  app.on('before-quit', () => {
    isQuiting = true;
  });

  app.on('second-instance', (e, commandLine, cwd) => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
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
}
