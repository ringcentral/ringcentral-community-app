const { app, BrowserWindow } = require('electron');
const singleInstanceLock = app.requestSingleInstanceLock();

const { version } = require('./package.json');

if (!singleInstanceLock) {
  console.warn('App already running');
	app.quit();
  return;
}

let mainWindow;
function createMainWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      // partition: "persist:rcappstorage",
      reload: "./preload.js",
      nativeWindowOpen: true,
      disableBlinkFeatures: 'AcceleratedSmallCanvases',
      enableRemoteModule: false,
    },
    show: true,
    title: 'RingCentral (Community)',
  });
  if (process.env.DEBUG == 1) {
    mainWindow.webContents.openDevTools();
  }
// and load the index.html of the app.
  mainWindow.loadURL('https://app.ringcentral.com', {
    userAgent: `Chrome/${process.versions.chrome} RingCentral(Community)/${version}`,
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
});
