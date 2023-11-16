console.log('meeting preload');

const { ipcRenderer } = require('electron');

function getScreenSources(types) {
  return ipcRenderer.invoke('GET-SCREEN-SOURCE', { types });
}

window.navigator.mediaDevices.getDisplayMedia = async (options) => {
  if (navigator.userAgent.indexOf('PipeWire') > -1) {
    const sources = await getScreenSources(['screen']);
    return window.navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id,
          maxWidth: options.video.width.max,
          maxHeight: options.video.height.max,
        }
      }
    });
  }
  return new Promise(async (resolve, reject) => {
    try {
      const sources = await getScreenSources(['screen', 'window']);
      const style = document.createElement('style');
      style.textContent = `
          .desktop-capturer-selection {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            background: rgba(30,30,30,.75);
            color: #fff;
            z-index: 10000000;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .desktop-capturer-selection__scroller {
            width: 100%;
            max-height: 100vh;
            overflow-y: auto;
          }
          .desktop-capturer-selection__list {
            max-width: calc(100% - 100px);
            margin: 50px;
            padding: 0;
            display: flex;
            flex-wrap: wrap;
            list-style: none;
            overflow: hidden;
            justify-content: center;
          }
          .desktop-capturer-selection__item {
            display: flex;
            margin: 4px;
          }
          .desktop-capturer-selection__btn {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            width: 145px;
            margin: 0;
            border: 0;
            border-radius: 3px;
            padding: 4px;
            background: #252626;
            text-align: left;
            transition: background-color .15s, box-shadow .15s;
          }
          .desktop-capturer-selection__btn:hover,
          .desktop-capturer-selection__btn:focus {
            background: rgba(98,100,167,.8);
          }
          .desktop-capturer-selection__thumbnail {
            width: 100%;
            height: 81px;
            object-fit: cover;
          }
          .desktop-capturer-selection__name {
            margin: 6px 0 6px;
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
          }
        `;
      document.head.append(style);
      const selectionElem = document.createElement('div')
      selectionElem.classList = 'desktop-capturer-selection';
      selectionElem.innerHTML = `
          <div class="desktop-capturer-selection__scroller">
            <ul class="desktop-capturer-selection__list">
              ${sources.map(({ id, name, thumbnail, display_id, appIcon }) => `
                <li class="desktop-capturer-selection__item">
                  <button class="desktop-capturer-selection__btn" data-id="${id}" title="${name}">
                    <img class="desktop-capturer-selection__thumbnail" src="${thumbnail.toDataURL()}" />
                    <span class="desktop-capturer-selection__name">${name}</span>
                  </button>
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      document.body.appendChild(selectionElem);
      document.querySelector('.desktop-capturer-selection').addEventListener('click', (e) => {
        if (e.path.find((ele) => ele.className.indexOf('desktop-capturer-selection__btn') > -1)) {
          return;
        }
        selectionElem.remove();
        style.remove();
        reject('cancel');
      });
      document.querySelectorAll('.desktop-capturer-selection__btn')
        .forEach(button => {
          button.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
              const id = button.getAttribute('data-id');
              const source = sources.find(source => source.id === id);
              if (!source) {
                throw new Error(`Source with id ${id} does not exist`);
              }
              const mandatory = {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
              };
              if (options.video.width) {
                mandatory.maxWidth = options.video.width.max;
              }
              if (options.video.height) {
                mandatory.maxHeight = options.video.height.max;
              }
              const stream = await window.navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { mandatory }
              });
              selectionElem.remove();
              style.remove();
              resolve(stream);
            } catch (err) {
              console.error('Error selecting desktop capture source:');
              console.error(err);
              reject(err);
            }
          })
        })
    } catch (err) {
      console.error('Error displaying desktop capture sources:', err);
      reject(err);
    }
  });
}
