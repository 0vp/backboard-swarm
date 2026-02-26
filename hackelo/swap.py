import argparse
import hashlib
from itertools import cycle
from pathlib import Path
import random
import string
import sys
import time
from typing import Iterator

import requests


RANKINGS_URL = "https://hackelo.vercel.app/api/rankings"
VOTE_URL = "https://hackelo.vercel.app/api/vote"
PROXY_FILE = Path(__file__).with_name("ip.txt")


def load_proxy_urls(file_path: Path) -> list[str]:
    proxy_urls: list[str] = []
    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split(":", 3)
        if len(parts) != 4:
            continue
        host, port, username, password = parts
        proxy_urls.append(f"http://{username}:{password}@{host}:{port}")

    if not proxy_urls:
        raise ValueError(f"No valid proxies found in {file_path}")
    return proxy_urls


def to_proxy_dict(proxy_url: str) -> dict:
    return {"http": proxy_url, "https": proxy_url}

RANKINGS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
    "Accept": "*/*",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Referer": "https://hackelo.vercel.app/rankings",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Priority": "u=4",
    "TE": "trailers",
}

VOTE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
    "Accept": "*/*",
    "Accept-Language": "en-CA,en-US;q=0.9,en;q=0.8",
    "Referer": "https://hackelo.vercel.app/rankings",
    "Content-Type": "application/json",
    "Origin": "https://hackelo.vercel.app",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Priority": "u=0",
    "TE": "trailers",
}


def generate_fingerprint() -> str:
    random_str = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    return hashlib.md5(random_str.encode()).hexdigest()


def fetch_rankings(session: requests.Session, proxy_url: str) -> list[dict]:
    response = session.get(RANKINGS_URL, headers=RANKINGS_HEADERS, proxies=to_proxy_dict(proxy_url), timeout=30)
    response.raise_for_status()
    rankings = response.json()
    if not isinstance(rankings, list) or not rankings:
        raise ValueError("Rankings response was empty or invalid")
    return rankings


def find_mchacks(rankings: list[dict]) -> dict:
    for hackathon in rankings:
        if str(hackathon.get("slug", "")).lower() == "mchacks":
            return hackathon
    raise ValueError("Could not find mchacks in rankings")


def submit_vote(session: requests.Session, winner_id: str, loser_id: str, proxy_cycle: Iterator[str]) -> dict:
    backoff = 2.0
    while True:
        payload = {
            "winner_id": winner_id,
            "loser_id": loser_id,
            "fingerprint": generate_fingerprint(),
        }
        proxy_url = next(proxy_cycle)
        try:
            response = session.post(
                VOTE_URL,
                headers=VOTE_HEADERS,
                json=payload,
                # proxies=to_proxy_dict(proxy_url),
                timeout=30,
            )

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                wait_seconds = backoff
                if retry_after:
                    try:
                        wait_seconds = max(float(retry_after), 0.5)
                    except ValueError:
                        wait_seconds = backoff
                print(f"Got 429 rate limit on {proxy_url}. Retrying in {wait_seconds:.1f}s...")
                time.sleep(wait_seconds)
                backoff = min(backoff * 2, 60.0)
                continue

            if 400 <= response.status_code < 500:
                response.raise_for_status()

            if response.status_code >= 500:
                print(
                    f"Server error {response.status_code} on {proxy_url}. Retrying in {backoff:.1f}s..."
                )
                time.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
                continue

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as exc:
            print(f"Vote request error on {proxy_url}: {exc}. Retrying in {backoff:.1f}s...")
            time.sleep(backoff)
            backoff = min(backoff * 2, 60.0)


def build_opponents(rankings: list[dict], mchacks_id: str) -> list[dict]:
    sorted_rankings = sorted(rankings, key=lambda x: x.get("rank", float("inf")))
    opponents = [item for item in sorted_rankings if item.get("id") != mchacks_id]
    if not opponents:
        raise ValueError("No opponents found in rankings")
    return opponents


def find_target_opponent(rankings: list[dict], target_id: str, mchacks_id: str) -> dict:
    if target_id == mchacks_id:
        raise ValueError("Target id cannot be mchacks id")
    for hackathon in rankings:
        if hackathon.get("id") == target_id:
            return hackathon
    raise ValueError(f"Target id not found in rankings: {target_id}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Continuously vote for mchacks against all opponents or a specific target id"
    )
    parser.add_argument("--target", help="Target hackathon id to vote against; if omitted, targets all")
    parser.add_argument("--sleep", type=float, default=0.5, help="Seconds to wait between votes")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one cycle only (single vote with --target, full pass without --target)",
    )
    args = parser.parse_args()

    session = requests.Session()
    total_votes = 0

    try:
        proxy_urls = load_proxy_urls(PROXY_FILE)
        random.shuffle(proxy_urls)
        proxy_cycle = cycle(proxy_urls)
        print(f"Loaded {len(proxy_urls)} rotating proxies from {PROXY_FILE}")

        rankings_proxy_url = next(proxy_cycle)
        rankings = fetch_rankings(session, rankings_proxy_url)
        mchacks = find_mchacks(rankings)
        mchacks_id = mchacks["id"]
        if args.target:
            target_opponent = find_target_opponent(rankings, args.target, mchacks_id)
            opponents = [target_opponent]
            print(f"Found mchacks: {mchacks.get('name')} ({mchacks.get('school')})")
            print(f"Target: {target_opponent.get('name')} (rank {target_opponent.get('rank')})")
        else:
            opponents = build_opponents(rankings, mchacks_id)
            print(f"Found mchacks: {mchacks.get('name')} ({mchacks.get('school')})")
            print(f"Targeting all opponents ({len(opponents)} total)")

        print("Starting rotating votes...\n")

        cycle_count = 0
        while True:
            cycle_count += 1
            for opponent in opponents:
                result = submit_vote(session, mchacks_id, opponent["id"], proxy_cycle)
                total_votes += 1
                print(
                    f"[cycle {cycle_count}] vote #{total_votes}: mchacks -> {opponent.get('name')} "
                    f"(rank {opponent.get('rank')}) | {result}"
                )
                if args.sleep > 0:
                    time.sleep(args.sleep)

            if args.once:
                break

        print(f"Completed. Total votes cast: {total_votes}")

    except KeyboardInterrupt:
        print(f"\nStopped by user. Total votes cast: {total_votes}")
        sys.exit(0)
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
