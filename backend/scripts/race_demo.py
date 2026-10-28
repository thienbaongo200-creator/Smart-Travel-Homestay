"""Chạy: python scripts/race_demo.py <room_id> [số_luồng]"""
import json
import sys
import threading
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = "http://127.0.0.1:8000/api"


def call(path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, json.dumps(body).encode() if body is not None else None, headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


room_id = int(sys.argv[1])
n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
ci = date.today() + timedelta(days=10)
tokens = [call("/auth/login/", {"username": u, "password": "123456"})[1]["access"] for u in ("khach1", "khach2")]
barrier, results = threading.Barrier(n), []


def worker(i):
    barrier.wait()  # cả n luồng cùng bắn một lúc
    st, data = call("/bookings/", {"room_id": room_id, "check_in": ci.isoformat(),
                                    "check_out": (ci + timedelta(days=2)).isoformat(), "guests": 2}, tokens[i % 2])
    results.append((st, data.get("code") or data.get("detail")))


ts = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
[t.start() for t in ts]
[t.join() for t in ts]
for r in sorted(results):
    print(r)
print("Thành công:", sum(1 for s, _ in results if s == 201), "| Bị chặn (409):", sum(1 for s, _ in results if s == 409))