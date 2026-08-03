#!/usr/bin/env python3
"""通过 GitHub Git Data API 发布 dist/ 到 gh-pages 分支。
适用于 github.com 域名不可达、但 api.github.com 可用的网络环境。
用法: python3 deploy_api.py [dist目录]
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request

REPO = "nicekidsg/plush-crush"
BRANCH = "gh-pages"
DIST = sys.argv[1] if len(sys.argv) > 1 else "dist"


def get_token() -> str:
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, check=True,
    )
    for line in proc.stdout.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    raise SystemExit("未能从 git 凭据中获取 GitHub token")


def api(method: str, path: str, token: str, payload: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        method=method,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "plush-crush-deploy",
        },
        data=json.dumps(payload).encode() if payload is not None else None,
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def main() -> None:
    token = get_token()

    files = []
    for root, _dirs, names in os.walk(DIST):
        for name in names:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, DIST).replace(os.sep, "/")
            files.append((rel, full))
    files.append((".nojekyll", None))
    print(f"📦 {len(files)} 个文件待发布")

    tree_items = []
    for rel, full in files:
        content = b"" if full is None else open(full, "rb").read()
        blob = api("POST", f"/repos/{REPO}/git/blobs", token,
                   {"content": base64.b64encode(content).decode(), "encoding": "base64"})
        tree_items.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print(f"  ↑ {rel}")

    parents = []
    try:
        ref = api("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}", token)
        parents = [ref["object"]["sha"]]
    except Exception:
        pass

    tree = api("POST", f"/repos/{REPO}/git/trees", token, {"tree": tree_items})
    commit = api("POST", f"/repos/{REPO}/git/commits", token,
                 {"message": "deploy: plush crush", "tree": tree["sha"], "parents": parents})

    if parents:
        api("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", token,
            {"sha": commit["sha"], "force": True})
    else:
        api("POST", f"/repos/{REPO}/git/refs", token,
            {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})

    print(f"✅ 已发布 {commit['sha'][:7]} → https://nicekidsg.github.io/plush-crush/ （约 1 分钟后生效）")


if __name__ == "__main__":
    main()
