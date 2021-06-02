console.log('preload');

const { ipcRenderer } = require('electron');

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
