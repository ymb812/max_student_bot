"""Local deployment helper. Reads credentials only from ignored .local/server.json."""

import json
import sys
from pathlib import Path
import paramiko

sys.stdout.reconfigure(encoding="utf-8")

config = json.loads(Path(".local/server.json").read_text(encoding="utf-8-sig"))
client = paramiko.SSHClient()
keys = Path(".local/known_hosts")
if keys.exists():
    client.load_host_keys(str(keys))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
else:
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    hostname=config["host"],
    username=config["username"],
    password=config["password"],
    timeout=20,
)
client.save_host_keys(str(keys))
if sys.argv[1] == "inspect":
    commands = [
        "test ! -L /opt/max && ls -ld /opt/max 2>/dev/null",
        "docker ps --format '{{.Names}} {{.Ports}}'",
        "ss -lntp",
        "df -h /opt",
        "command -v docker; command -v nginx; command -v caddy",
    ]
    for command in commands:
        print(command)
        _, out, err = client.exec_command(command)
        print(out.read().decode(), err.read().decode())
elif sys.argv[1] == "run":
    command = sys.argv[2]
    if not command.startswith("cd /opt/max && "):
        raise SystemExit("Remote mutations must be scoped to /opt/max")
    _, out, err = client.exec_command(command)
    for line in out:
        print(line, end="")
    print(err.read().decode())
    if out.channel.recv_exit_status():
        raise SystemExit(1)
elif sys.argv[1] == "upload":
    _, out, err = client.exec_command(
        "test ! -L /opt/max && mkdir -p /opt/max && realpath /opt/max"
    )
    resolved = out.read().decode().strip()
    if resolved != "/opt/max" or out.channel.recv_exit_status():
        raise SystemExit("Unsafe target path")
    sftp = client.open_sftp()
    paths = [Path("app"), Path("scripts"), Path("tests"), Path("deploy")]
    files = [
        p
        for base in paths
        for p in base.rglob("*")
        if p.is_file() and "__pycache__" not in p.parts
    ]
    files += [
        Path(n)
        for n in [
            "requirements.txt",
            "requirements-dev.txt",
            "deploy.sh",
            ".gitignore",
            "Dockerfile",
            "docker-compose.yml",
            ".dockerignore",
            ".env.example",
            "README.md",
            "DATA-API.yaml",
            "openapi.json",
        ]
        if Path(n).exists()
    ]
    files += [
        Path("docs") / name
        for name in (
            "CODE_MAP.md",
            "IMPLEMENTATION_STATUS.md",
            "DEPLOYMENT.md",
            "SUBMISSION_CHECKLIST.md",
            "OPERATIONS.md",
            "PRESENTATION_CONTENT.md",
            "MAX_TEST_GUIDE.md",
            "DEMO_PROFILES.md",
            "MAX_ACCEPTANCE_2026_09_28.md",
        )
        if (Path("docs") / name).exists()
    ]
    for path in files:
        remote = "/opt/max/" + path.as_posix()
        parent = Path(path).parent
        current = "/opt/max"
        for part in parent.parts:
            current += "/" + part
            try:
                attrs = sftp.lstat(current)
                import stat

                if not stat.S_ISDIR(attrs.st_mode):
                    raise SystemExit("Unsafe remote directory")
            except FileNotFoundError:
                sftp.mkdir(current)
        try:
            import stat

            if stat.S_ISLNK(sftp.lstat(remote).st_mode):
                raise SystemExit("Refusing to write a symlink")
        except FileNotFoundError:
            pass
        sftp.put(str(path), remote)
    print("Uploaded", len(files), "project files to /opt/max")
    sftp.close()
elif sys.argv[1] == "env":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.config import Settings

    values = {
        k.upper(): str(v).lower() if isinstance(v, bool) else str(v)
        for k, v in Settings().model_dump().items()
    }
    values.update(APP_PORT="8097", BIND_ADDRESS="127.0.0.1", BOT_TRANSPORT="disabled")
    sftp = client.open_sftp()
    import stat

    try:
        if stat.S_ISLNK(sftp.lstat("/opt/max/.env").st_mode):
            raise SystemExit("Unsafe env target")
    except FileNotFoundError:
        pass
    with sftp.open("/opt/max/.env", "w") as f:
        f.write("\n".join(k + "=" + v for k, v in values.items()) + "\n")
    sftp.chmod("/opt/max/.env", 0o600)
    sftp.close()
    print(
        "Server configuration written securely; bot transport stays disabled during checks"
    )
elif sys.argv[1] == "activate":
    import re

    _, out, err = client.exec_command(
        "cd /opt/max && docker compose -f docker-compose.yml -f scripts/tunnel-compose.yml logs tunnel"
    )
    logs = out.read().decode() + err.read().decode()
    matches = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", logs)
    if not matches:
        raise SystemExit("Tunnel URL not ready")
    url = matches[-1]
    sftp = client.open_sftp()
    with sftp.open("/opt/max/.env") as f:
        env = f.read().decode()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.config import Settings

    updates = {
        "PUBLIC_BASE_URL": url,
        "MAX_BOT_USERNAME": Settings().max_bot_username,
        "BOT_TRANSPORT": "polling",
    }
    for name, value in updates.items():
        env = re.sub(
            r"^" + name + r"=.*$", lambda _: name + "=" + value, env, flags=re.M
        )
    with sftp.open("/opt/max/.env", "w") as f:
        f.write(env)
    sftp.chmod("/opt/max/.env", 0o600)
    Path(".local/public-url.txt").write_text(url, encoding="utf-8")
    print(url)
    sftp.close()
client.close()
