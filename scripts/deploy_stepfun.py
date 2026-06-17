# -*- coding: utf-8 -*-
"""部署：Layer1 重命名 + 阶跃星辰接入"""
import paramiko, io, time, os

HOST, PORT, USER, PASS = '103.236.92.40', 42677, 'root', 'p3MN8nSO5ayW'
LOCAL_BASE = r'D:\rightnow项目最新\RightNow-3.2'

RAG_FILES = [
    'config.py', 'main.py',
    'services/ingest.py', 'services/retriever.py',
    'services/multi_layer.py', 'services/web_search.py',
    'scripts/ingest_all.py',
]

def run(ssh, cmd, timeout=300):
    print(f'$ {cmd[:120]}')
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    code = out.channel.recv_exit_status()
    o = out.read().decode('utf-8', errors='replace').rstrip()
    e = err.read().decode('utf-8', errors='replace').rstrip()
    if o: print(o[-500:])
    if e and code != 0: print('[stderr]', e[:500])
    return code

print('Connecting...')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
sftp = ssh.open_sftp()

# ── 1. Upload RAG files ──
print('\n=== Upload RAG files ===')
for f in RAG_FILES:
    local = os.path.join(LOCAL_BASE, 'rag-service', f)
    remote = f'/root/rightnow/rag-service/{f}'
    try:
        sftp.put(local, remote)
        print(f'  OK {f}')
    except Exception as e:
        print(f'  FAIL {f}: {e}')

# ── 2. Upload frontend ──
local_gemini = os.path.join(LOCAL_BASE, 'frontend', 'services', 'gemini.ts')
remote_gemini = '/root/rightnow/frontend/services/gemini.ts'
try:
    sftp.put(local_gemini, remote_gemini)
    print('  OK frontend/services/gemini.ts')
except Exception as e:
    print(f'  FAIL gemini.ts: {e}')

# Also upload new docker-compose with StepFun env
local_dc = os.path.join(LOCAL_BASE, 'docker-compose.prod.yml')
remote_dc = '/root/rightnow/docker-compose.prod.yml'
try:
    sftp.put(local_dc, remote_dc)
    print('  OK docker-compose.prod.yml')
except Exception as e:
    print(f'  FAIL docker-compose.prod.yml: {e}')

sftp.close()

# ── 3. Rebuild & restart RAG container ──
print('\n=== Rebuild RAG ===')
code = run(ssh, 'cd /root/rightnow && docker compose -f docker-compose.prod.yml build rag 2>&1', timeout=600)
if code != 0:
    print('BUILD FAILED, using docker cp fallback...')
    run(ssh, 'docker cp /root/rightnow/rag-service/config.py rn-rag:/app/config.py', timeout=15)
    run(ssh, 'docker cp /root/rightnow/rag-service/services/multi_layer.py rn-rag:/app/services/multi_layer.py', timeout=15)
    run(ssh, 'docker cp /root/rightnow/rag-service/services/ingest.py rn-rag:/app/services/ingest.py', timeout=15)
    run(ssh, 'docker cp /root/rightnow/rag-service/services/retriever.py rn-rag:/app/services/retriever.py', timeout=15)
    run(ssh, 'docker cp /root/rightnow/rag-service/main.py rn-rag:/app/main.py', timeout=15)
    run(ssh, 'docker cp /root/rightnow/rag-service/scripts/ingest_all.py rn-rag:/app/scripts/ingest_all.py', timeout=15)
    run(ssh, 'docker restart rn-rag', timeout=30)

# ── 4. Start RAG ──
run(ssh, 'cd /root/rightnow && docker compose -f docker-compose.prod.yml up -d rag 2>&1', timeout=60)
time.sleep(15)

# ── 5. Rebuild & start frontend ──
print('\n=== Rebuild Frontend ===')
# Need to build with VITE_STEPFUN_API_KEY
api_key = "79fV2Xpx6s1OWBfikED7d3lJYEmmF8P0Ih1iRgCrkQI2cNpBCFL9tad0mEXFc7nkN"
# Step 1: Upload API key to frontend .env before build
run(ssh, f'echo "VITE_STEPFUN_API_KEY={api_key}" > /root/rightnow/frontend/.env.production && echo ENV_WRITTEN', timeout=10)
run(ssh, 'cd /root/rightnow && docker compose -f docker-compose.prod.yml build frontend 2>&1', timeout=600)
run(ssh, 'cd /root/rightnow && docker compose -f docker-compose.prod.yml up -d frontend 2>&1', timeout=60)

# ── 6. Verify ──
print('\n=== Health check ===')
time.sleep(10)
run(ssh, 'docker exec rn-rag python -c "import urllib.request as u; print(u.urlopen(\"http://localhost:8000/health\", timeout=30).read().decode())"', timeout=60)

# Quick RAG search test
print('\n=== Search test ===')
test_cmd = '''docker exec rn-rag python -c "
import urllib.request as u, json
q = {'query': '减脂平台期怎么办', 'top_k': 3}
d = json.dumps(q, ensure_ascii=False).encode()
r = u.Request('http://localhost:8000/search', data=d, headers={'Content-Type': 'application/json'})
o = json.loads(u.urlopen(r, timeout=60).read().decode())
print('source_layer:', o.get('source_layer'))
for m in o['results']['metadatas'][0]:
    print(' ', m.get('source','?')[:30], m.get('domain','?'))
"'''
run(ssh, test_cmd, timeout=120)

ssh.close()
print('\n=== DEPLOY DONE ===')
