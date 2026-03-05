const express = require('express');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3848;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const CONFIG_PATH = path.join(__dirname, 'config.json');

// ── Load / generate config ─────────────────────────────
let nodeConfig = {};

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.log('config.json not found, running auto-detect...');
        try {
            execSync('python3 ' + path.join(__dirname, 'detect-config.py') + ' --output ' + CONFIG_PATH, {
                stdio: 'inherit', timeout: 30000
            });
        } catch (e) {
            console.error('Auto-detect failed:', e.message);
        }
    }
    if (fs.existsSync(CONFIG_PATH)) {
        nodeConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        console.log('Config loaded: ' + nodeConfig.node?.moniker + ' (' + nodeConfig.node?.chain_id + ')');
    }
}
loadConfig();

// Build env vars from config for scripts (NO wallet/personal info exposed)
function configEnv() {
    const c = nodeConfig;
    return {
        NODE_HOME: c.node?.home || '/root/.republicd',
        NODE_MONIKER: c.node?.moniker || '',
        NODE_CHAIN_ID: c.node?.chain_id || '',
        NODE_RPC: c.endpoints?.rpc || 'tcp://localhost:26657',
        NODE_RPC_HTTP: c.endpoints?.rpc_http || 'http://localhost:26657',
        NODE_RPC_PORT: String(c.ports?.rpc || 26657),
        NODE_API: c.endpoints?.api || '',
        NODE_GRPC: c.endpoints?.grpc || '',
        KEYRING_BACKEND: c.wallet?.keyring_backend || 'test',
    };
}

function childEnv() {
    return {
        ...process.env,
        TERM: 'dumb',
        HOME: process.env.HOME || '/root',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/go/bin',
        ...configEnv()
    };
}

function runCmd(script) {
    return spawn('bash', ['-c', script], { env: childEnv() });
}

function runPython(scriptPath, args) {
    const pyArgs = [scriptPath];
    if (args) pyArgs.push(...args.split(/\s+/));
    return spawn('python3', pyArgs, { env: childEnv() });
}

// Expose SAFE config to frontend (no wallet, no personal info)
app.get('/api/config', (req, res) => {
    const safe = {
        node: { moniker: nodeConfig.node?.moniker, chain_id: nodeConfig.node?.chain_id },
        ports: nodeConfig.ports,
    };
    res.json(safe);
});

// SSE endpoint — streams command output in real-time
app.get('/api/run', (req, res) => {
    const cmdId = req.query.cmd;
    const args = (req.query.args || '').trim();
    const command = COMMANDS[cmdId];
    if (!command) return res.status(400).json({ error: 'Unknown command: ' + cmdId });

    let proc;
    if (command.pyfile) {
        proc = runPython(path.join(SCRIPTS_DIR, command.pyfile), args);
    } else {
        let script;
        if (typeof command.script === 'function') {
            script = command.script(args);
        } else {
            script = command.script;
        }
        proc = runCmd(script);
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    proc.stdout.on('data', (d) => {
        res.write('data: ' + JSON.stringify({ type: 'stdout', text: d.toString() }) + '\n\n');
    });
    proc.stderr.on('data', (d) => {
        res.write('data: ' + JSON.stringify({ type: 'stderr', text: d.toString() }) + '\n\n');
    });
    proc.on('close', (code) => {
        res.write('data: ' + JSON.stringify({ type: 'done', code }) + '\n\n');
        res.end();
    });
    proc.on('error', (err) => {
        res.write('data: ' + JSON.stringify({ type: 'error', text: err.message }) + '\n\n');
        res.end();
    });
    req.on('close', () => { try { proc.kill(); } catch (e) { } });
});

// ── Command Registry (READ-ONLY COMMANDS ONLY) ─────────
const COMMANDS = {};

function reg(id, label, group, icon, opts) {
    if (typeof opts === 'string') {
        COMMANDS[id] = { label, group, icon, script: opts };
    } else if (typeof opts === 'function') {
        COMMANDS[id] = { label, group, icon, script: opts };
    } else {
        COMMANDS[id] = { label, group, icon, ...opts };
    }
}

// === Status (read-only) ===
reg('status', 'Node Status', 'status', '🟢', { pyfile: 'status.py' });
reg('services', 'Services Status', 'status', '⚙️', { pyfile: 'services.py' });
reg('delegations', 'Delegations', 'status', '🤝', { pyfile: 'delegations.py' });
reg('validators', 'All Validators', 'status', '📊', { pyfile: 'validators.py' });
reg('peers', 'Connected Peers', 'status', '🌐', { pyfile: 'peers.py' });

// === Jobs (read-only query) ===
reg('all-jobs', 'All Jobs', 'jobs', '📜', { pyfile: 'all-jobs.py' });
reg('query-job', 'Query Job', 'jobs', '🔍', function (input) {
    input = (input || '').trim();
    if (/^[0-9]+$/.test(input)) {
        return 'echo "🔍 Job #' + input + ' — Full Details" && echo "" && ' +
            'echo "=== Job Status ===" && ' +
            'republicd query computevalidation job ' + input + ' --node $NODE_RPC -o json 2>&1 | jq -r \'.job | ' +
            '"  ID:         " + .id + "\\n" + ' +
            '"  Status:     " + .status + "\\n" + ' +
            '"  Creator:    " + .creator + "\\n" + ' +
            '"  Target:     " + .target_validator + "\\n" + ' +
            '"  Hash:       " + (.result_hash // "-") + "\\n" + ' +
            '"  Fetch URL:  " + (.result_fetch_endpoint // "-") + "\\n" + ' +
            '"  Inference:  " + (.inference_image // "-") + "\\n" + ' +
            '"  Verify:     " + (.verification_image // "-")\' && echo "" && ' +
            'echo "=== Submit Transaction ===" && ' +
            'TXJSON=$(republicd query txs --query "job_submitted.job_id=\'' + input + '\'" --node $NODE_RPC -o json 2>&1) && ' +
            'TXHASH=$(echo "$TXJSON" | jq -r ".txs[0].txhash // empty") && ' +
            'if [ -z "$TXHASH" ]; then echo "  No submit TX found"; else ' +
            'echo "$TXJSON" | jq -r \'.txs[0] | ' +
            '"  TX Hash:    " + .txhash + "\\n" + ' +
            '"  Height:     " + .height + "\\n" + ' +
            '"  Gas Used:   " + .gas_used + " / " + .gas_wanted + "\\n" + ' +
            '"  Timestamp:  " + .timestamp + "\\n" + ' +
            '"  Code:       " + (.code // 0 | tostring)\' && echo "" && ' +
            'echo "=== Events ===" && echo "$TXJSON" | jq -r \'.txs[0].events[] | ' +
            '"  [" + .type + "]" + "\\n" + ' +
            '(.attributes | map("    " + .key + " = " + .value) | join("\\n"))\'; fi';
    }
    return 'republicd query tx ' + input + ' --node $NODE_RPC -o json 2>&1 | jq .';
});

// Command list endpoint
app.get('/api/commands', (req, res) => {
    const cmds = {};
    for (const [id, cmd] of Object.entries(COMMANDS)) {
        cmds[id] = { label: cmd.label, group: cmd.group, icon: cmd.icon, hasArgs: typeof cmd.script === 'function' };
    }
    res.json({ commands: cmds, services: [] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('RepublicAI Public Dashboard: http://localhost:' + PORT);
    console.log('Node: ' + (nodeConfig.node?.moniker || '?') + ' | RPC port: ' + (nodeConfig.ports?.rpc || '?'));
});
