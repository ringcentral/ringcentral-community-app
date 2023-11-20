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
      isRCElectron: false,
      brandName: 'RingCentral',
      userAgentName: 'RCAppDesktop',
      electronVersion: process.versions.electron,
      electronAppVersion: '23.4.12.8466 Community',
      electronAppVersionNumber: '23.4.12',
      platform: process.platform,
      chromiumVersion: process.versions.chrome,
      arch: process.arch,
      dependencies: {
        rcvDesktopSDKVersion: '63.4.0',
        rcvSDKVersion: '23.3.24',
        zoomIsDecoupled: true,
        zoomSDKVersion: '5.7.6.1340',
      },
    };
  },
  send: (...args) => console.log('send', args),
  dispatch: (...args) => console.log('dispatch', args),
  pipe: (event) => {
    ipcRenderer.send('PIPE_MESSAGE', event);
  },
  webFrame,
  ipcRenderer,
  setBadgeCount: (count) => {
    ipcRenderer.send('SHOW_NOTIFICATIONS_COUNT', count);
  },
};

window.rcCommunity = {};

window.addEventListener('load', () => {
  ipcRenderer.send('RC_COMMUNITY_APP_LOADED');
  const aboutPageObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(function(node) {
          if (
            node.attributes['data-test-automation-id'] &&
            node.attributes['data-test-automation-id'].value === 'about-page-dialog'
          ) {
            let versionNode = node.querySelector("p[data-test-automation-id='about-dialog-version']");
            versionNode.childNodes.forEach((textNode) => {
              if (textNode.textContent.indexOf('Web') > -1) {
                let webVersion = textNode.textContent.split(',')[0];
                textNode.textContent = [webVersion, `${window.rcCommunity.appVersion} Community`].join(', ');
              }
            });
            let appName = node.querySelector('h2');
            appName.textContent = 'About RingCentral (Community)';
          }
        })
      }
    });
  });
  aboutPageObserver.observe(document.querySelector('body'), {
    childList: true,
  });
});

ipcRenderer.on('COMMUNITY_APP_INFO', (event, arg) => {
  window.rcCommunity.appVersion = arg.appVersion;
});

ipcRenderer.on('OPEN_ABOUT_DIALOG', (event, arg) => {
  window.jupiterElectron.handleAboutPage(window.rcCommunity.appVersion, process.versions.electron);
});

function disableHerculesSetting() {
  const globalUID = localStorage.getItem('global.account.UD');
  if (globalUID) {
    localStorage.setItem(`${JSON.parse(globalUID)}.SETTING.RCVE_HERCULES_ENABLE`, `{"source":false}`);
  }
}

disableHerculesSetting();

setInterval(() => {
  disableHerculesSetting();
}, 10000);
