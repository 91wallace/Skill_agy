/**
 * File & Directory Handler for Termux Web CLI v2
 */
const fs = require('fs');
const path = require('path');

function handleListDir(session, tabId, parsed, ws) {
    let rawPath = parsed.path || (session ? session.cwd : null) || process.env.HOME || '/root';
    const userHome = process.env.HOME || '/root';
    if (rawPath === '~') {
        rawPath = userHome;
    } else if (rawPath.startsWith('~/')) {
        rawPath = path.join(userHome, rawPath.substring(2));
    }

    let targetPath;
    if (path.isAbsolute(rawPath)) {
        targetPath = path.normalize(rawPath);
    } else {
        targetPath = path.resolve((session ? session.cwd : null) || userHome, rawPath);
    }

    fs.readdir(targetPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            ws.send(JSON.stringify({
                type: 'dir_list_result',
                tabId: tabId,
                requestId: parsed.requestId,
                path: targetPath,
                error: err.message,
                items: []
            }));
            return;
        }

        const showHidden = parsed.showHidden === true;
        const filteredEntries = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));

        const items = filteredEntries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isSymbolicLink: entry.isSymbolicLink()
        })).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        ws.send(JSON.stringify({
            type: 'dir_list_result',
            tabId: tabId,
            requestId: parsed.requestId,
            path: targetPath,
            items: items
        }));
    });
}

module.exports = { handleListDir };
