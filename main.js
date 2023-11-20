const path = require('path');
const { cpus } = require('os');
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  session,
  Menu,
  MenuItem,
  Tray,
  desktopCapturer,
} = require('electron');
const ProgressBar = require('electron-progressbar');
const isMac = process.platform === 'darwin'

const singleInstanceLock = app.requestSingleInstanceLock();
const webAppUrl = 'https://app.ringcentral.com';

let enablePipeWire = false;
if (
  process.env.ORIGINAL_XDG_CURRENT_DESKTOP && (
    process.env.ORIGINAL_XDG_CURRENT_DESKTOP.indexOf('GNOME') > -1 ||
    process.env.ORIGINAL_XDG_CURRENT_DESKTOP.indexOf('KDE') > -1 ||
    process.env.ORIGINAL_XDG_CURRENT_DESKTOP.indexOf('SWAY') > -1
  )
) {
  enablePipeWire = true;
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}

let mainWindow;
let meetingWindow;
let childWindowMap = new Map();
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
      label: 'About', click: () => {
        showAboutDialog();
      }
    },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
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

function zoomInWindow() {
  if (mainWindow) {
    mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.1);
  }
}

function zoomOutWindow() {
  if (mainWindow) {
    const zoomLevel = mainWindow.webContents.getZoomLevel() - 0.1;
    mainWindow.webContents.setZoomLevel(zoomLevel < 0 ? 0 : zoomLevel);
  }
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
  mainWindow.loadURL(webAppUrl);
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
  mainWindow.webContents.on('did-create-window', (childWindow, { frameName }) => {
    childWindow.webContents.on('will-navigate', (e, url) => {
      if (url.indexOf('https://meetings.ringcentral.com') > -1) {
        e.preventDefault();
        shell.openExternal(url);
        childWindow.close();
        return;
      }
      childWindowMap.set(frameName, childWindow);
      childWindow.show();
      childWindow.on('close', () => {
        childWindowMap.delete(frameName);
      });
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
    const menu = new Menu();

    // Add each spelling suggestion
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => mainWindow.webContents.replaceMisspelling(suggestion)
      }));
    }
    const spellcheckMenu = new Menu();
    mainWindow.webContents.session.availableSpellCheckerLanguages.forEach((lang) => {
      spellcheckMenu.append(new MenuItem({
        label: lang,
        click: () => {
          mainWindow.webContents.session.setSpellCheckerLanguages([lang]);
        }
      }));
    });
    menu.append(new MenuItem({
      label: 'Spell Checker Language',
      submenu: spellcheckMenu,
    }));
    menu.popup();
  });
  mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    if (zoomDirection === 'in') {
      zoomInWindow();
    }
    if (zoomDirection === 'out') {
      zoomOutWindow();
    }
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
  const CORSfilter = {
    urls: ['https://v.ringcentral.com/*'],
  };
  mainWindow.webContents.session.webRequest.onHeadersReceived(CORSfilter, (details, callback) => {
    if (!details.referrer) {
      callback({ responseHeaders: details.responseHeaders })
      return;
    }
    const url = new URL(details.referrer);
    if (url.origin === webAppUrl) {
      if (details.responseHeaders['access-control-allow-origin']) {
        details.responseHeaders['access-control-allow-origin'] = [webAppUrl];
      } else {
        details.responseHeaders['Access-Control-Allow-Origin'] = [webAppUrl];
      }
    }
    callback({ responseHeaders: details.responseHeaders })
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

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'q') {
      console.log('Pressed Control/Command+Q')
      app.quit();
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

function showAboutDialog() {
  if (mainWindow) {
    mainWindow.webContents.send('OPEN_ABOUT_DIALOG');
  }
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

const template = [
  {
    label: app.name,
    submenu: [
      {
        label: 'About',
        click: () => {
          showAboutDialog();
        }
      },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q', click: () => app.quit()
      },
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ]
  },
];

const mainMenu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(mainMenu);

if (!singleInstanceLock) {
  console.warn('App already running');
  app.quit();
} else {
  app.whenReady().then(createMainWindow);

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
    if (!isMac) {
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

  ipcMain.on('SHOW_NOTIFICATIONS_COUNT', (_, count) => {
    app.setBadgeCount(count ? count : 0);
  });

  function sendReceivedToRender(event, id) {
    const payload = {
      type: 'RECEIVED',
      id,
    };
    mainWindow.webContents.send('COMMUNICATION_BETWEEN_MAIN_AND_RENDER', {
      event,
      payload,
      body: payload,
    });
  }

  function sendResponseToRender(event, id, body) {
    const payload = {
      type: 'RESPONSE',
      id,
      body,
    };
    mainWindow.webContents.send('COMMUNICATION_BETWEEN_MAIN_AND_RENDER', {
      event,
      payload,
      body: payload,
    });
  }

  ipcMain.on('COMMUNICATION_BETWEEN_MAIN_AND_RENDER', (_, { event, payload, body }) => {
    // console.log('event', event);
    // console.log('payload', payload);
    if (event === 'rcv:open-rcv') {
      if (!meetingWindow) {
        const sess = session.fromPartition('persist:rcvstorage');
        const userAgent = getUserAgent(sess, true);
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
      sendReceivedToRender(event, payload.id);
      const windowId = `${Date.now()}`;
      if (payload.body.options.alwaysOpenInBrowser) {
        shell.openExternal(payload.body.url);
      } else {
        const childWindow = new BrowserWindow({
          parent: mainWindow,
        });
        childWindow.loadURL(payload.body.url);
        childWindowMap.set(windowId, childWindow);
        childWindow.on('close', () => {
          childWindowMap.delete(windowId);
        });
      }
      sendResponseToRender(event, payload.id, windowId);
    }
    if (event === 'WINDOW_MANAGER_CLOSE') {
      sendReceivedToRender(event, payload.id);
      const childWindow = childWindowMap.get(payload.body.windowId);
      if (childWindow) {
        childWindow.close();
      }
      sendResponseToRender(event, payload.id, undefined);
    }
    if (event === 'WINDOW_MANAGER_FOCUS') {
      sendReceivedToRender(event, payload.id);
      const childWindow = childWindowMap.get(payload.body);
      if (childWindow) {
        childWindow.show();
        childWindow.focus();
      } else {
        openMainWindow();
      }
      sendResponseToRender(event, payload.id, undefined);
    }
    if (event === 'WINDOW_MANAGER_REMOVE_MENU') {
      sendReceivedToRender(event, payload.id);
      const childWindow = childWindowMap.get(payload.body);
      if (childWindow) {
        childWindow.removeMenu();
      }
      sendResponseToRender(event, payload.id, undefined);
    }
    if (event === 'WINDOW_MANAGER_DESTROY') {
      sendReceivedToRender(event, payload.id);
      const childWindow = childWindowMap.get(payload.body);
      if (childWindow) {
        childWindow.close();
      }
      sendResponseToRender(event, payload.id, undefined);
    }
    if (event === 'IS_API_COMPATIBLE_EVENT') {
      sendReceivedToRender(event, payload.id);
      sendResponseToRender(event, payload.id, true);
    }
    if (event === 'INVOKE_MODULE_API') {
      if (payload.body.api === 'GET_SYSTEM_CPU_INFO') {
        sendReceivedToRender(event, payload.id);
        const result = cpus();
        sendResponseToRender(event, payload.id, {
          core: result.length,
          model: result[0]?.model,
        });
      } else if (payload.body.api === 'GET_SYSTEM_CPU_USAGE') {
        sendReceivedToRender(event, payload.id);
        const result = cpus();
        const totalUsage = result.reduce((acc, cur) => {
          acc.user += cur.times.user;
          acc.nice += cur.times.nice;
          acc.sys += cur.times.sys;
          acc.idle += cur.times.idle;
          acc.irq += cur.times.irq;
          return acc;
        }, { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 });
        sendResponseToRender(event, payload.id, totalUsage.idle / (totalUsage.user + totalUsage.nice + totalUsage.sys + totalUsage.idle + totalUsage.irq));
      } else if (payload.body.api === 'FLUSH_STORAGE_DATA') {
        sendReceivedToRender(event, payload.id);
        const sess = mainWindow.webContents.session;
        sess.flushStorageData();
        sendResponseToRender(event, payload.id, undefined);
      } else if (payload.body.api === 'GET_CURRENT_FOCUS_WINDOW_ID') {
        sendReceivedToRender(event, payload.id);
        let focusWindow;
        childWindowMap.forEach((childWindow) => {
          if (childWindow.isFocused()) {
            focusWindow = childWindow;
          }
        });
        sendResponseToRender(event, payload.id, focusWindow && focusWindow.id);
      } else if (payload.body.api === 'GET_WINDOW_IDS') {
        sendReceivedToRender(event, payload.id);
        const ids = [];
        childWindowMap.forEach((_, key) => {
          ids.push(key);
        });
        sendResponseToRender(event, payload.id, ids);
      } else if (payload.body.api === 'IS_WINDOW_MINIMIZED') {
        sendReceivedToRender(event, payload.id);
        sendResponseToRender(event, payload.id, mainWindow.isMinimized());
      } else if (payload.body.api === 'SET_BACKGROUND_COLOR') {
        sendReceivedToRender(event, payload.id);
        const win = childWindowMap.get(payload.body.params.id);
        if (win) {
          win.setBackgroundColor(payload.body.params.color);
        }
      } else if (payload.body.api === 'GET_BOUNDS') {
        sendReceivedToRender(event, payload.id);
        const win = childWindowMap.get(payload.body.params);
        if (win) {
          sendResponseToRender(event, payload.id, win.getBounds());
        }
      } else if (payload.body.api === 'GET_CONTENT_BOUNDS') {
        sendReceivedToRender(event, payload.id);
        const win = childWindowMap.get(payload.body.params);
        if (win) {
          sendResponseToRender(event, payload.id, win.getContentBounds());
        }
      } else if (payload.body.api === 'SET_BOUNDS') {
        sendReceivedToRender(event, payload.id);
        const win = childWindowMap.get(payload.body.params.id);
        if (win) {
          win.setBounds({
            x: payload.body.params.x,
            y: payload.body.params.y,
            width: payload.body.params.width,
            height: payload.body.params.height,
          });
        }
      }
    }
    if (event === 'app.permission.query') {
      sendResponseToRender(event, payload.id, 'granted');
    }
  });
  ipcMain.on('PIPE_MESSAGE', (_, event) => {
    if (event.type === 'download-file') {
      mainWindow.webContents.downloadURL(event.url);
    }
  });
  ipcMain.on('RC_COMMUNITY_APP_LOADED', () => {
    mainWindow.webContents.send('COMMUNITY_APP_INFO', {
      appVersion: app.getVersion(),
    });
  });
  ipcMain.handle('GET-SCREEN-SOURCE', (_, params) => {
    return desktopCapturer.getSources({ types: params.types });
  });
}
