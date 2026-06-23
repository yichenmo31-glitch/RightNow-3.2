#!/usr/bin/env python3
"""Safely update StepFun-related environment values on a remote RightNow host.

This helper intentionally reads connection details and secrets from environment
variables. Do not hardcode server addresses, passwords, API keys, or tokens in
this file.
"""

from __future__ import annotations

import os
import json
import subprocess
import sys
import textwrap


REQUIRED_ENV = (
    "RIGHTNOW_SSH_HOST",
    "RIGHTNOW_SSH_PORT",
    "RIGHTNOW_SSH_USER",
    "STEPFUN_API_KEY",
)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def main() -> int:
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name, "").strip()]
    if missing:
        print("Missing required environment variables:", ", ".join(missing), file=sys.stderr)
        print(
            "Required: RIGHTNOW_SSH_HOST, RIGHTNOW_SSH_PORT, RIGHTNOW_SSH_USER, STEPFUN_API_KEY",
            file=sys.stderr,
        )
        return 2

    host = require_env("RIGHTNOW_SSH_HOST")
    port = require_env("RIGHTNOW_SSH_PORT")
    user = require_env("RIGHTNOW_SSH_USER")
    remote_dir = os.environ.get("RIGHTNOW_REMOTE_DIR", "/root/rightnow").strip()
    stepfun_key = require_env("STEPFUN_API_KEY")
    stepfun_base_url = os.environ.get("STEPFUN_BASE_URL", "https://api.stepfun.com/v1").strip()
    payload = json.dumps(
        {
            "remote_dir": remote_dir,
            "stepfun_base_url": stepfun_base_url,
            "stepfun_api_key": stepfun_key,
        }
    )

    remote_script = (
        f"payload_json = {payload!r}\n"
        + textwrap.dedent(
            """
        import json
        import os
        from pathlib import Path

        payload = json.loads(payload_json)
        remote_dir = Path(payload["remote_dir"])
        env_path = remote_dir / ".env"
        env_path.parent.mkdir(parents=True, exist_ok=True)

        existing = {}
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if not line or line.lstrip().startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                existing[key.strip()] = value.strip()

        existing["STEPFUN_BASE_URL"] = payload["stepfun_base_url"]
        existing["STEPFUN_API_KEY"] = payload["stepfun_api_key"]

        content = "\\n".join(f"{key}={value}" for key, value in sorted(existing.items())) + "\\n"
        env_path.write_text(content, encoding="utf-8")
        os.chmod(env_path, 0o600)
        print("UPDATED_STEPFUN_ENV")
        """
        )
    )

    ssh_cmd = ["ssh", "-p", port, f"{user}@{host}", "python3 -"]
    subprocess.run(ssh_cmd, input=remote_script, text=True, check=True)

    if os.environ.get("RIGHTNOW_RESTART_BACKEND") == "1":
        restart_cmd = [
            "ssh",
            "-p",
            port,
            f"{user}@{host}",
            f"cd {remote_dir} && docker compose -f docker-compose.prod.yml up -d backend",
        ]
        subprocess.run(restart_cmd, check=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
