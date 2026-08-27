"""
ERP Agent Bridge Protocol
작업 데이터 클래스 및 상수 정의
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

# 작업 상태
STATUS_PENDING     = "pending"
STATUS_ACCEPTED    = "accepted"
STATUS_PROCESSING  = "processing"
STATUS_COMPLETED   = "completed"
STATUS_ERROR       = "error"

# 운영 시간 (KST, 기본: 08:00 ~ 익일 01:00)
DEFAULT_OPEN_HOUR  = 8
DEFAULT_CLOSE_HOUR = 1   # 익일 01:00

# 지수 백오프 (초)
BACKOFF_STEPS = [5, 15, 30, 60, 120, 300]

@dataclass
class AgentJob:
    job_id:     str
    agent_type: str
    user_id:    str
    input:      str
    status:     str      = STATUS_PENDING
    created_at: Optional[str] = None

@dataclass
class DeltaChunk:
    job_id:  str
    seq:     int
    content: str
