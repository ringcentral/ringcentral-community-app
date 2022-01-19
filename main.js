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
const ProgressBar = require('electron-progressbar');

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
let messageSequence = 1;
const schemes = ['tel', 'callto', 'rcvdt', 'rcapp'];

function isValidSchemeUri(url) {
  let valid = false;
  schemes.forEach((scheme) => {
    if (url.indexOf(`${scheme}:`) === 0) {
      valid = true;
    }
  });
  return valid;
}

function createTray(iconPath) {
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App', click: () => {
        openMainWindow();
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
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    item.on('updated', (event, state) => {
      const hasSavePath = !!item.getSavePath();
      if (!item.progressBar && hasSavePath) {
        item.progressBar = new ProgressBar({
          text: `Download ${item.getFilename()}`,
          detail: 'Download in progress...',
          indeterminate: false,
          browserWindow: {
            closable: true,
          },
        });
        item.progressBar.on('aborted', () => {
          item.progressBar = null;
          item.cancel();
        });
      }
      if (!item.progressBar) {
        return;
      }
      if (state === 'interrupted') {
        item.progressBar.detail = 'Download is interrupted';
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          item.progressBar.detail = 'Download is paused';
        } else {
          item.progressBar.detail = 'Download in progress...';
          if (item.progressBar.isInProgress()) {
            item.progressBar.value = (item.getReceivedBytes() / item.getTotalBytes()) * 100;
          }
        }
      }
    });
    item.once('done', (event, state) => {
      if (!item.progressBar) {
        return;
      }
      if (state === 'completed') {
        item.progressBar.setCompleted();
      } else if (state === 'cancelled') {
        item.progressBar.close();
      } else {
        item.progressBar.detail = 'Download is failed';
      }
      item.progressBar = null;
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

function openMainWindow() {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function handleCustomSchemeURI(url) {
  if (!isValidSchemeUri(url)) {
    return;
  }
  if (!mainWindow) {
    return;
  }
  messageSequence += 1;
  mainWindow.webContents.send('COMMUNICATION_BETWEEN_MAIN_AND_RENDER', {
    event: 'open-url-scheme',
    payload: {
      body: url,
      id: messageSequence,
    },
  });
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
    openMainWindow();
    commandLine.forEach(cmd => {
      handleCustomSchemeURI(cmd);
    });
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
    // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createMainWindow();
    } else {
      openMainWindow();
    }
  });

  app.on('browser-window-created', (_, window) => {
    window.setMenu(null);
    if (process.env.DEBUG == 1) {
      window.openDevTools();
    }
  });

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      schemes.forEach((scheme) => {
        app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])]);
      });
    }
  } else {
    schemes.forEach((scheme) => {
      app.setAsDefaultProtocolClient(scheme);
    });
  }
  // for macOS, linux
  app.on('open-url', function (event, url) {
    event.preventDefault();
    handleCustomSchemeURI(url);
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
      openMainWindow();
    }
  });
  ipcMain.on('pipe-message', (_, event) => {
    if (event.type === 'download-file') {
      mainWindow.webContents.downloadURL(event.url);
    }
  });
}
