"""API(uvicorn)と画面(next dev)をまとめて起こす開発用のランチャー。

    .venv/bin/python -m tools.dev                 # .env の db に向けて :8000 / :3000
    .venv/bin/python -m tools.dev --test          # 空のテスト用の db とモックのログインで起こす
    .venv/bin/python -m tools.dev --test --seed   # そのテスト用の db に乱数の行を足してから起こす

どちらかが落ちる・応答しなくなったら、そちらだけを起こし直す。Ctrl+C で両方を止める。
"""

import argparse
import logging
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from tools import testing_db
from tools.free_port import free_port

# python -m で起こすと __name__ が __main__ になり、ログの名前で何のログか分からなくなる
logger = logging.getLogger("tools.dev")

BACK_DIR = Path(__file__).resolve().parent.parent
FRONT_DIR = BACK_DIR.parent / "front"
WATCH_INTERVAL_S = 20
STARTUP_TIMEOUT_S = 180

MOCK_USER = {
    "SUB": "local-dev-user",
    "USERNAME": "local-dev-user",
    "EMAIL": "dev@example.com",
}


def responds(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=5):
            return True
    except urllib.error.HTTPError:
        # 4xx / 5xx でも、プロセスが応答している
        return True
    except OSError:
        return False


class Child:
    def __init__(self, name: str, args: list[str], cwd: Path, env: dict[str, str], url: str):
        self.name = name
        self.args = args
        self.cwd = cwd
        self.env = env
        self.url = url
        self.proc: subprocess.Popen | None = None
        self.silent_since: float | None = None

    def start(self) -> None:
        logger.info(f"{self.name} を起こす: {' '.join(self.args)}")
        # 子の子(uvicorn の reloader、next の worker)ごと止められるよう、別のプロセスグループにする
        self.proc = subprocess.Popen(
            self.args,
            cwd=self.cwd,
            env=self.env,
            start_new_session=True,
        )

    def stop(self) -> None:
        if self.proc is None or self.proc.poll() is not None:
            return
        os.killpg(self.proc.pid, signal.SIGTERM)
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(self.proc.pid, signal.SIGKILL)

    def wait_ready(self) -> None:
        deadline = time.monotonic() + STARTUP_TIMEOUT_S
        while time.monotonic() < deadline:
            if responds(self.url):
                logger.info(f"{self.name} が応答した: {self.url}")
                return
            if self.proc is not None and self.proc.poll() is not None:
                raise RuntimeError(f"{self.name} が起動中に止まった(exit {self.proc.returncode})")
            time.sleep(1)
        raise RuntimeError(f"{self.name} が {STARTUP_TIMEOUT_S} 秒で応答しなかった: {self.url}")

    def healthy(self) -> bool:
        """止まっている、または WATCH_INTERVAL_S を越えて応答しないなら False。"""
        if self.proc is None or self.proc.poll() is not None:
            return False
        if responds(self.url):
            self.silent_since = None
            return True
        # uvicorn の reloader は、worker が import で落ちても親が生きたまま応答しなくなる
        now = time.monotonic()
        self.silent_since = self.silent_since or now
        return now - self.silent_since <= WATCH_INTERVAL_S


def seed(url: str) -> None:
    """テスト用の db に、全部の表の乱数の行と、モックのログインの利用者を足す。"""
    # pin() のあとに読む。先に読むと .env の db に向けた engine ができる
    from debug.db.randomize.random_all_data import randomize_all_data
    from debug.db.setup.setup_debug_user import create_debug_user

    randomize_all_data()
    create_debug_user()
    logger.info(f"{url.rsplit('/', 1)[1]} に乱数の行を足した")


def build_children(args: argparse.Namespace) -> list[Child]:
    api_env = dict(os.environ)
    web_env = dict(os.environ)
    if args.test:
        url = testing_db.pin("archieves_test_dev")
        testing_db.recreate_database(url)
        testing_db.upgrade_head(url)
        if args.seed:
            seed(url)
        api_env["DATABASE_URL"] = url
        api_env["AUTH_MODE"] = "mock"
        web_env["NEXT_PUBLIC_AUTH_MODE"] = "mock"
        for key, value in MOCK_USER.items():
            api_env[f"MOCK_USER_{key}"] = value
            web_env[f"NEXT_PUBLIC_MOCK_USER_{key}"] = value
    web_env["ARCHIEVES_API_URL"] = f"http://127.0.0.1:{args.api_port}"
    if args.dist_dir:
        web_env["ARCHIEVES_WEB_DIST_DIR"] = args.dist_dir

    uvicorn_args = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(args.api_port),
    ]
    if not args.no_reload:
        uvicorn_args += [
            "--reload",
            "--reload-dir",
            "app",
            "--reload-dir",
            "mods",
        ]
    return [
        Child(
            "api",
            uvicorn_args,
            BACK_DIR,
            api_env,
            f"http://127.0.0.1:{args.api_port}/api/v1/health",
        ),
        Child(
            "web",
            [
                "npm",
                "run",
                "dev",
                "--",
                "--port",
                str(args.web_port),
            ],
            FRONT_DIR,
            web_env,
            f"http://localhost:{args.web_port}/",
        ),
    ]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="API と画面をまとめて起こす")
    parser.add_argument(
        "--api-port",
        type=int,
        default=8000,
    )
    parser.add_argument(
        "--web-port",
        type=int,
        default=3000,
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="空のテスト用の db(archieves_test_dev)とモックのログインで起こす",
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="--test の db に乱数の行(debug/db/randomize)とモックの利用者を足す",
    )
    parser.add_argument(
        "--dist-dir",
        help="next dev のビルド先。ユーザの next dev と並べて起こすときに .next-test などを渡す",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="API をコードの変更で起こし直さない",
    )
    args = parser.parse_args(argv)
    if args.seed and not args.test:
        parser.error("--seed は --test と一緒に使う(.env の db には足さない)")
    logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")

    if not (FRONT_DIR / "node_modules").is_dir():
        logger.info("source/front に node_modules が無いので npm ci する")
        subprocess.run(["npm", "ci"], cwd=FRONT_DIR, check=True)

    children = build_children(args)
    for port in (args.api_port, args.web_port):
        free_port(port)
    # SIGTERM でも finally で子を止めるよう、Ctrl+C と同じ扱いにする
    signal.signal(signal.SIGTERM, signal.default_int_handler)
    try:
        for child in children:
            child.start()
        for child in children:
            child.wait_ready()
        logger.info(f"画面: http://localhost:{args.web_port}")
        while True:
            time.sleep(WATCH_INTERVAL_S)
            for child in children:
                if not child.healthy():
                    logger.warning(f"{child.name} が止まった・応答しないので起こし直す")
                    child.stop()
                    child.start()
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            child.stop()


if __name__ == "__main__":
    main()
