# RingCentral (Community) app

This app is built based on RingCentral web app `https://app.ringcentral.com` and `Electron.js`. 
It aims to build a community version of [RingCentral desktop app](https://www.ringcentral.com/apps/rc-app) for Linux, and work for other OS.

![RingCentral community app in ubuntu](https://user-images.githubusercontent.com/7036536/120785928-37491200-c560-11eb-8eaf-30afce528aca.png)

## Usage

> Only Tested at Ubuntu now

For Linux, download installer files (deb, AppImage and rpm) [here](https://github.com/embbnux/ringcentral-community-app/releases).


```bash
$ sudo dpkg -i ringcentral-community-app_0.0.1_amd64.deb
```

## Development

Require `Node.js` >= 14.0, and `yarn`

1. Clone this project
2. Install dependencies:

```
$ yarn
```

3. Start app

```
$ yarn start
```

4. Package app

```
$ yarn package-linux
```
