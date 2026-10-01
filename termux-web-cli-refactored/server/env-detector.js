/**
 * Environment Detector for Termux, PRoot, and Linux distributions.
 */
const fs = require('fs');

function getHostEnvironmentType() {
    let distroName = null;
    try {
        if (fs.existsSync('/etc/os-release')) {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const nameMatch = osRelease.match(/^(?:NAME|ID)=(?:")?([^"\n\r]+)(?:")?/m);
            if (nameMatch && nameMatch[1]) {
                const rawName = nameMatch[1].trim();
                if (/ubuntu/i.test(rawName)) distroName = 'Ubuntu';
                else if (/debian/i.test(rawName)) distroName = 'Debian';
                else if (/arch/i.test(rawName)) distroName = 'Arch';
                else if (/alpine/i.test(rawName)) distroName = 'Alpine';
                else if (/fedora/i.test(rawName)) distroName = 'Fedora';
                else if (/kali/i.test(rawName)) distroName = 'Kali';
                else if (/void/i.test(rawName)) distroName = 'Void';
                else distroName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            }
        }
    } catch (e) {}

    if (distroName && !/termux/i.test(distroName)) {
        return { type: 'distro', label: distroName };
    }

    const isTermux = !!(process.env.TERMUX_VERSION || (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) || fs.existsSync('/data/data/com.termux/files/usr/bin/bash'));
    const isProot = fs.existsSync('/proot') || (process.env.PROOT_TMP_DIR !== undefined) || (process.env.PRUN !== undefined);

    if (isTermux && !isProot) {
        return { type: 'termux', label: 'Termux' };
    } else if (distroName) {
        return { type: 'distro', label: distroName };
    } else {
        return { type: 'distro', label: 'Linux' };
    }
}

module.exports = { getHostEnvironmentType };
