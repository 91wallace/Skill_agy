/**
 * Reactive State Store for Termux Web CLI v2
 */
class AppState {
    constructor() {
        this.activeTabId = 'tab-1';
        this.tabs = [];
        this.sessionsData = new Map(); // tabId -> { history: [], cwd: '~', isRunning: false, isPty: false, isSsh: false, isAgyMode: false }
        this.commandHistory = [];
        this.commandHistoryIndex = -1;
        this.showHiddenFiles = false;

        // Custom theme colors
        this.colors = {
            prompt: '#facc15',
            dir: '#facc15',
            file: '#9ca3af'
        };

        // Saved SSH profiles & Snippets & Clipboard
        this.sshProfiles = [];
        this.snippets = [
            { name: 'Git Status', cmd: 'git status' },
            { name: 'Git Log', cmd: 'git log --oneline -n 10' },
            { name: 'Uptime & RAM', cmd: 'uptime && free -h' },
            { name: 'List Ports', cmd: 'netstat -tuln' }
        ];
        this.clipboardHistory = [];

        this.listeners = new Set();
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const savedColors = localStorage.getItem('termux_cli_colors');
            if (savedColors) Object.assign(this.colors, JSON.parse(savedColors));

            const savedHidden = localStorage.getItem('termux_cli_show_hidden');
            if (savedHidden !== null) this.showHiddenFiles = savedHidden === 'true';

            const savedProfiles = localStorage.getItem('termux_cli_ssh_profiles');
            if (savedProfiles) this.sshProfiles = JSON.parse(savedProfiles);

            const savedSnippets = localStorage.getItem('termux_cli_snippets');
            if (savedSnippets) this.snippets = JSON.parse(savedSnippets);

            const savedClipboard = localStorage.getItem('termux_cli_clipboard');
            if (savedClipboard) this.clipboardHistory = JSON.parse(savedClipboard);

            const savedCmdHistory = localStorage.getItem('termux_cli_cmd_history');
            if (savedCmdHistory) this.commandHistory = JSON.parse(savedCmdHistory);
        } catch (e) {
            console.warn('[State] Erro ao carregar localStorage:', e);
        }
    }

    saveColors() {
        localStorage.setItem('termux_cli_colors', JSON.stringify(this.colors));
        this.applyColors();
    }

    applyColors() {
        document.documentElement.style.setProperty('--color-prompt-line', this.colors.prompt);
        document.documentElement.style.setProperty('--color-dir-item', this.colors.dir);
        document.documentElement.style.setProperty('--color-file-item', this.colors.file);
    }

    saveSnippets() {
        localStorage.setItem('termux_cli_snippets', JSON.stringify(this.snippets));
    }

    saveSshProfiles() {
        localStorage.setItem('termux_cli_ssh_profiles', JSON.stringify(this.sshProfiles));
    }

    saveClipboard() {
        localStorage.setItem('termux_cli_clipboard', JSON.stringify(this.clipboardHistory.slice(0, 50)));
    }

    saveCommandHistory() {
        localStorage.setItem('termux_cli_cmd_history', JSON.stringify(this.commandHistory.slice(-100)));
    }

    addCommandToHistory(cmd) {
        if (!cmd || !cmd.trim()) return;
        const trimmed = cmd.trim();
        const index = this.commandHistory.indexOf(trimmed);
        if (index > -1) this.commandHistory.splice(index, 1);
        this.commandHistory.push(trimmed);
        this.commandHistoryIndex = -1;
        this.saveCommandHistory();
        this.notify('history_updated');
    }

    addClipboardItem(text) {
        if (!text || !text.trim()) return;
        const trimmed = text.trim();
        const index = this.clipboardHistory.indexOf(trimmed);
        if (index > -1) this.clipboardHistory.splice(index, 1);
        this.clipboardHistory.unshift(trimmed);
        this.saveClipboard();
        this.notify('clipboard_updated');
    }

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    notify(event, data) {
        this.listeners.forEach(fn => fn(event, data));
    }
}

export const state = new AppState();
