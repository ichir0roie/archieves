"""指定したポートで聞いているプロセスを止める。起動の前に、前の起動の残りを片付けるのに使う。

.venv/bin/python -m tools.free_port 8000 3000
"""

import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

logger = logging.getLogger("tools.free_port")


def _listening_pids(port: int) -> set[int]:
    if sys.platform == "darwin":
        result = subprocess.run(
            ["lsof", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            check=False,
        )
        return {int(pid) for pid in result.stdout.split()}
    # ss / lsof の入っていないコンテナがあるので、/proc から LISTEN のソケットの持ち主を引く
    inodes = set()
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            rows = Path(table).read_text().splitlines()[1:]
        except OSError:
            continue
        for row in rows:
            fields = row.split()
            local_port = int(fields[1].rsplit(":", 1)[1], 16)
            if local_port == port and fields[3] == "0A":
                inodes.add(fields[9])
    pids = set()
    for fd in Path("/proc").glob("[0-9]*/fd/*"):
        try:
            target = os.readlink(fd)
        except OSError:
            continue
        if target.startswith("socket:[") and target[8:-1] in inodes:
            pids.add(int(fd.parts[2]))
    return pids


def free_port(port: int) -> None:
    """port で聞いている前の起動の残りを止める。止まらなければ強く止める。"""
    pids = _listening_pids(port)
    for pid in pids:
        logger.info(f":{port} を使っている pid={pid} を止める")
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except ProcessLookupError:
            continue
    for _ in range(50):
        if not _listening_pids(port):
            return
        time.sleep(0.1)
    for pid in _listening_pids(port):
        os.killpg(os.getpgid(pid), signal.SIGKILL)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
    ports = sys.argv[1:] if argv is None else argv
    if not ports:
        sys.exit("使い方: python -m tools.free_port <port> [<port> ...]")
    for port in ports:
        free_port(int(port))


if __name__ == "__main__":
    main()
