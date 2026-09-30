# -*- coding: utf-8 -*-
"""
Gunicorn Production Configuration for Civil News Hub (JCloud Ubuntu 24.04 VM)
- Hardware: 1~2 vCPU, 2GB RAM
- Workers: 2
- Threads: 4 (worker-class: gthread for non-blocking Gemini API proxy & JSON streaming)
- Max Requests: 1000 (+100 jitter) for anti-memory leak
- Timeout: 90s (synced with Nginx proxy_read_timeout 90s)
"""

import os

# 1. 바인딩 주소 (Nginx 리버스 프록시 연동 포트)
bind = os.environ.get("GUNICORN_BIND", "127.0.0.1:5000")
backlog = 512

# 2. 워커 및 스레드 모델 (I/O Concurrency 최적화)
# 2개 워커 * 4개 스레드 = 동시 8개 요청 처리 (Gemini API 대기 시에도 블로킹 방지)
workers = 2
threads = 4
worker_class = "gthread"

# 3. 타임아웃 (AI 요약 스트림 및 프록시 대기 시간 보장)
timeout = 90
graceful_timeout = 30
keepalive = 5

# 4. 메모리 누수 방지 (주기적 워커 리사이클)
max_requests = 1000
max_requests_jitter = 100

# 5. 워커 하트비트 공유 메모리 활용 (디스크 I/O 병목 제거)
worker_tmp_dir = "/dev/shm"

# 6. 로깅 설정
accesslog = "-"
errorlog = "-"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" (%(D)sus)'

proc_name = "civil-news-hub-gunicorn"
