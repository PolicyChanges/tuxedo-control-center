import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as child_process from 'child_process';

let win: Electron.BrowserWindow;

const watch = process.argv.includes('--watch');

if (watch) {
    require('electron-reload')(path.join(__dirname, '..', 'ng-app'));
}

function createWindow() {
    win = new BrowserWindow({
        title: 'TUXEDO Control Center',
        width: 1024,
        height: 768,
        frame: false,
        resizable: false,
        icon: path.join(__dirname, '../data/dist-data/tuxedo-control-center_256.png'),
        webPreferences: {
            nodeIntegration: true
        }
    });

    const indexPath = path.join(__dirname, '..', 'ng-app', 'index.html');
    win.loadFile(indexPath);
    win.on('closed', () => {
        win = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (win === null) {
        createWindow();
    }
});

ipcMain.on('exec-cmd-sync', (event, arg) => {
    try {
        event.returnValue = { data: child_process.execSync(arg), error: undefined };
    } catch (err) {
        event.returnValue = { data: undefined, error: err };
    }
});

ipcMain.on('exec-cmd-async', (event, arg) => {
    try {
        event.reply('exec-cmd-result', { data: child_process.execSync(arg), error: undefined });
    } catch (err) {
        event.reply('exec-cmd-result', { data: undefined, error: err });
    }
});
