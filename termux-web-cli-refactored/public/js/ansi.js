/**
 * High-performance ANSI to HTML Parser for Terminal Streams
 */

const ANSI_COLOR_MAP = {
    30: 'ansi-black',
    31: 'ansi-red',
    32: 'ansi-green',
    33: 'ansi-yellow',
    34: 'ansi-blue',
    35: 'ansi-magenta',
    36: 'ansi-cyan',
    37: 'ansi-white',
    90: 'ansi-bright-black',
    91: 'ansi-bright-red',
    92: 'ansi-bright-green',
    93: 'ansi-bright-yellow',
    94: 'ansi-bright-blue',
    95: 'ansi-bright-magenta',
    96: 'ansi-bright-cyan',
    97: 'ansi-bright-white'
};

export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function ansiToHtml(text) {
    if (!text) return '';
    let result = '';
    let currentColor = null;
    let isBold = false;

    // Pattern to match ANSI escape sequences
    const regex = /\x1b\[([0-9;]*)m/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const textChunk = text.substring(lastIndex, match.index);
        if (textChunk) {
            let escaped = escapeHtml(textChunk);
            let classes = [];
            if (currentColor) classes.push(currentColor);
            if (isBold) classes.push('font-bold');

            if (classes.length > 0) {
                result += `<span class="${classes.join(' ')}">${escaped}</span>`;
            } else {
                result += escaped;
            }
        }

        const codes = match[1] ? match[1].split(';').map(Number) : [0];
        for (const code of codes) {
            if (code === 0) {
                currentColor = null;
                isBold = false;
            } else if (code === 1) {
                isBold = true;
            } else if (ANSI_COLOR_MAP[code]) {
                currentColor = ANSI_COLOR_MAP[code];
            }
        }
        lastIndex = regex.lastIndex;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
        let escaped = escapeHtml(remainingText);
        let classes = [];
        if (currentColor) classes.push(currentColor);
        if (isBold) classes.push('font-bold');

        if (classes.length > 0) {
            result += `<span class="${classes.join(' ')}">${escaped}</span>`;
        } else {
            result += escaped;
        }
    }

    return result;
}
