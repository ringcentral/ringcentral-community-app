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
      electronAppVersion: '22.1.31.2868 Community',
      electronAppVersionNumber: '22.1.31',
      platform: process.platform,
      chromiumVersion: process.versions.chrome,
      arch: process.arch,
      dependencies: {
        rcvDesktopSDKVersion: '52.3.0',
        rcvSDKVersion: '22.1.18',
        zoomIsDecoupled: true,
        zoomSDKVersion: '5.4.55057.1129 Decoupled (always)',
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
};

window.rcCommunity = {};

window.addEventListener('load', () => {
  ipcRenderer.send('RC_COMMUNITY_APP_LOADED');
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      const matchedTitle = document.title.match(/\(\d+\)/);
      if (matchedTitle) {
        const messageUnreadCount = Number.parseInt(matchedTitle[0].match(/\d+/)[0]);
        ipcRenderer.send('SHOW_NOTIFICATIONS_COUNT', messageUnreadCount);
      } else {
        ipcRenderer.send('SHOW_NOTIFICATIONS_COUNT', 0);
      }
    });
  });
  observer.observe(document.querySelector('title'), {
    childList: true,
  });
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
