// RepublicAI Public Dashboard — Client JS
const outputEl = document.getElementById('output');
const spinnerEl = document.getElementById('output-spinner');
const titleEl = document.getElementById('output-title');
let currentSource = null;

// Strip ANSI codes for clean display
function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function appendOutput(text, cssClass) {
    const cleaned = stripAnsi(text);
    const span = document.createElement('span');
    if (cssClass) span.className = cssClass;
    span.textContent = cleaned;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
}

function clearOutput() {
    outputEl.textContent = '';
}

function copyLog() {
    const text = outputEl.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-log-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
}

function setRunning(label) {
    titleEl.textContent = label;
    spinnerEl.classList.remove('hidden');
}

let lastCmdId = '';

function setDone(code) {
    spinnerEl.classList.add('hidden');
    const status = code === 0 ? '✅ Done' : `❌ Exit: ${code}`;
    titleEl.textContent += ` — ${status}`;
}

function runCommand(cmdId, args = '') {
    if (currentSource) {
        currentSource.close();
        currentSource = null;
    }

    clearOutput();
    lastCmdId = cmdId;
    const label = cmdId + (args ? ` (${args})` : '');
    setRunning(label);

    const url = `/api/run?cmd=${encodeURIComponent(cmdId)}&args=${encodeURIComponent(args)}`;
    const es = new EventSource(url);
    currentSource = es;

    es.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'stdout') {
                appendOutput(data.text);
            } else if (data.type === 'stderr') {
                appendOutput(data.text, 'ansi-dim');
            } else if (data.type === 'done') {
                setDone(data.code);
                es.close();
                currentSource = null;
                if (cmdId === 'status') parseHealthBar(data.output);
            } else if (data.type === 'error') {
                appendOutput(`ERROR: ${data.text}\n`, 'ansi-red');
                es.close();
                currentSource = null;
            }
        } catch (err) {
            appendOutput(e.data + '\n');
        }
    };

    es.onerror = () => {
        setDone(-1);
        es.close();
        currentSource = null;
    };
}

// Parse health bar from status command JSON output (no balance/wallet info)
function parseHealthBar(output) {
    try {
        const jsonStart = output.indexOf('JSON_START');
        if (jsonStart === -1) return;
        const jsonStr = output.substring(jsonStart + 10).trim();
        const d = JSON.parse(jsonStr);

        const blockEl = document.getElementById('block-height');
        const syncEl = document.getElementById('sync-status');
        const peerEl = document.getElementById('peer-count');
        const valEl = document.getElementById('val-status');

        blockEl.textContent = `Block: ${d.block}`;
        blockEl.className = 'badge ok';

        syncEl.textContent = d.syncing ? 'Syncing ⏳' : 'Synced ✅';
        syncEl.className = d.syncing ? 'badge warn' : 'badge ok';

        peerEl.textContent = `Peers: ${d.peers}`;
        peerEl.className = parseInt(d.peers) > 3 ? 'badge ok' : 'badge warn';

        const isBonded = d.status.includes('BONDED');
        valEl.textContent = isBonded ? '🟢 Bonded' : d.status.replace('BOND_STATUS_', '');
        valEl.className = isBonded ? 'badge ok' : 'badge err';
    } catch (e) {
        // Silently fail
    }
}

// Wire up buttons
document.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        let args = '';
        if (btn.dataset.argsFrom) {
            const el = document.getElementById(btn.dataset.argsFrom);
            args = el ? el.value.trim() : '';
        }
        runCommand(cmd, args);
    });
});

// Enter key on job-id-input
const jobInput = document.getElementById('job-id-input');
if (jobInput) {
    jobInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runCommand('query-job', jobInput.value.trim());
    });
}

// Auto-refresh status on load
setTimeout(() => runCommand('status'), 500);
