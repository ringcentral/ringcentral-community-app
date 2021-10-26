console.log('preload');

const { ipcRenderer, webFrame } = require('electron');

// hack to get all message from rc app
// ipcRenderer.__$send = ipcRenderer.send;
// ipcRenderer.send = (...args) => {
//   console.log('ipc send', args);
//   return ipcRenderer.__$send(...args)
// };

window.__IS__ELECTRON__ = true;
window.jupiterElectron = {
  ...window.jupiterElectron,
  getElectronVersionInfo: () => {
    return {
      electronVersion: process.versions.electron,
      electronAppVersion: '21.4.20.197 Mac',
      electronAppVersionNumber: '21.4.20',
      platform: process.platform,
      chromiumVersion: process.versions.chrome,
      arch: process.arch,
      dependencies: {
        zoomSDKVersion: '49.0.0',
        rcvDesktopSDKVersion: '49.0.0',
        rcvSDKVersion: '49.0.0'
      },
    };
  },
  send: (...args) => console.log('send', args),
  dispatch: (...args) => console.log('dispatch', args),
  pipe: (...args) => console.log('pipe', args),
  webFrame,
  ipcRenderer,
};

window.addEventListener('load', () => {
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      const matchedTitle = document.title.match(/\(\d+\)/);
      if (matchedTitle) {
        const messageUnreadCount = Number.parseInt(matchedTitle[0].match(/\d+/)[0]);
        ipcRenderer.send('show-notifications-count', messageUnreadCount);
      } else {
        ipcRenderer.send('show-notifications-count', 0);
      }
    });
  });
  observer.observe(document.querySelector('title'), {
    childList: true,
  });
});
