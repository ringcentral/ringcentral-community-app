const path = require('path');
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  Menu,
  MenuItem,
  Tray,
  globalShortcut,
} = require('electron');
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
let meetingWindow;
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

function getUserAgent(sess, noElectron = false) {
  const defaultUserAgent = sess.getUserAgent();
  let userAgent = defaultUserAgent;
  if (noElectron) {
    userAgent = userAgent.replace(`Electron/${process.versions.electron} `, '');
  }
  if (enablePipeWire) {
    userAgent = `${userAgent} PipeWire`;
  }
  return userAgent;
}

function createMainWindow() {
  // Create the browser window.
  const sess = session.fromPartition('persist:rcappstorage');
  const webPreferences = {
    nodeIntegration: false,
    contextIsolation: false,
    session: sess,
    preload: path.join(__dirname, 'preload.js'),
    nativeWindowOpen: true,
    disableBlinkFeatures: 'AcceleratedSmallCanvases',
    enableRemoteModule: false,
    spellcheck: true,
  };
  const iconPath = path.join(__dirname, 'icons', '16x16.png');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 500,
    minHeight: 500,
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
    childWindow.webContents.on('will-navigate', (e, url) => {
      if (url.indexOf('https://meetings.ringcentral.com') > -1) {
        e.preventDefault();
        shell.openExternal(url);
        childWindow.close();
        return;
      }
      // const userAgent = getUserAgent(sess, true);
      // childWindow.webContents.loadURL(url, { userAgent });
    });
  });
  mainWindow.webContents.session.setSpellCheckerLanguages(['en-US']);
  mainWindow.webContents.on('context-menu', (event, params) => {
    const linkURL = params.linkURL;
    const selectedText = params.selectionText || linkURL;
    const isEditable = params.isEditable;
    const hasText = selectedText.trim().length > 0;

    if (!hasText && !isEditable) {
      return;
    }
    const menu = new Menu()

    // Add each spelling suggestion
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => mainWindow.webContents.replaceMisspelling(suggestion)
      }))
    }
    menu.popup()
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
  ipcMain.on('COMMUNICATION_BETWEEN_MAIN_AND_RENDER', (_, { event, payload, body }) => {
    // console.log('event', event);
    // console.log('payload', payload);
    if (event === 'rcv:open-rcv') {
      if (!meetingWindow) {
        const sess = session.fromPartition('persist:rcvstorage');
        const userAgent = getUserAgent(sess, true);
        console.log(userAgent);
        sess.setUserAgent(userAgent);
        meetingWindow = new BrowserWindow({
          parent: mainWindow,
          session: sess,
          width: 1024,
          height: 800,
          minWidth: 360,
          minHeight: 300,
          webPreferences: {
            contextIsolation: false,
            session: sess,
            preload: path.join(__dirname, 'meeting-preload.js'),
          }
        });
        meetingWindow.on('close', (event) => {
          meetingWindow = null;
        });
        sess.webRequest.onBeforeSendHeaders((details, callback) => {
          details.requestHeaders['User-Agent'] = userAgent;
          callback({
            cancel: false,
            requestHeaders: details.requestHeaders
          });
        });
      }
      meetingWindow.loadURL(payload.body.url);
    }
    if (event === 'ZOOM_ELECTRON_SERVICE:START_MEETING') {
      const uname = payload.body.username ? payload.body.username.split(' ').join('+') : '';
      shell.openExternal(`https://meetings.ringcentral.com/join?sid=${payload.body.meetingnumber}&uname=${uname}`);
    }
    if (event === 'WINDOW_MANAGER_CREATE') {
      if (payload.body.options.alwaysOpenInBrowser) {
        shell.openExternal(payload.body.url);
      } else {
        const childWindow = new BrowserWindow({
          parent: mainWindow,
        });
        childWindow.loadURL(payload.body.url);
      }
    }
    if (event === 'WINDOW_MANAGER_FOCUS') {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}
