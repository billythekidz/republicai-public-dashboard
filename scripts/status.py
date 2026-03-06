#!/usr/bin/env python3
"""Node health for PUBLIC dashboard — no personal identifiers."""
import json, os, subprocess, sys, urllib.request

def run(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() or r.stderr.strip()
    except:
        return ""

def http_get(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read())
    except:
        return {}

def mask(addr):
    """Mask address: rai1abc...xyz"""
    if not addr or len(addr) < 12:
        return "***"
    return addr[:6] + "..." + addr[-4:]

def main():
    valoper = os.environ.get("WALLET_VALOPER", "")
    wallet = os.environ.get("WALLET_ADDRESS", "")
    rpc = os.environ.get("NODE_RPC", "tcp://localhost:26657")
    rpc_http = os.environ.get("NODE_RPC_HTTP", "http://localhost:26657")
    home = os.environ.get("NODE_HOME", "/root/.republicd")
    wname = os.environ.get("WALLET_NAME", "my-wallet")
    kb = os.environ.get("KEYRING_BACKEND", "test")

    if not valoper:
        valoper = run(f"republicd keys show {wname} --bech val -a --home {home} --keyring-backend {kb}")
    if not wallet:
        wallet = run(f"republicd keys show {wname} -a --home {home} --keyring-backend {kb}")

    # RPC status
    status = http_get(f"{rpc_http}/status")
    sync_info = status.get("result", {}).get("sync_info", {})
    block = sync_info.get("latest_block_height", "?")
    syncing = sync_info.get("catching_up", "?")

    net = http_get(f"{rpc_http}/net_info")
    peers = net.get("result", {}).get("n_peers", "?")

    # Validator info
    val_raw = run(f"republicd query staking validator {valoper} --node {rpc} -o json")
    tokens, val_status, moniker, jailed = "0", "?", "?", "false"
    if val_raw:
        try:
            v = json.loads(val_raw)
            val = v.get("validator", v)
            tokens = val.get("tokens", "0")
            val_status = val.get("status", "?")
            moniker = val.get("description", {}).get("moniker", "?")
            jailed = str(val.get("jailed", False)).lower()
        except:
            pass

    tokens_rai = f"{int(tokens)/1e18:.2f}" if tokens.isdigit() else "?"

    # Public output — NO wallet, NO valoper, NO balance
    print("=== Node Health ===")
    print(f"  Moniker:   {moniker}")
    print(f"  Status:    {val_status}")
    print(f"  Jailed:    {jailed}")
    print(f"  Staked:    {tokens_rai} RAI")
    print(f"  Block:     {block}")
    print(f"  Syncing:   {syncing}")
    print(f"  Peers:     {peers}")
    print()
    print("JSON_START")
    print(json.dumps({
        "moniker": moniker,
        "status": val_status, "jailed": jailed == "true",
        "tokens": tokens,
        "block": str(block), "syncing": syncing, "peers": str(peers)
    }))

if __name__ == "__main__":
    main()
