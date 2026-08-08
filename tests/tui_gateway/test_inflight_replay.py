"""In-flight turn replay: thinking + tools survive for late subscribers.

A browser that refreshes / reconnects mid-turn misses the live
``thinking.delta`` / ``tool.start`` / ``message.delta`` frames (the events
feed is broadcast-only). The gateway keeps an ``inflight_turn`` snapshot so
``session.resume`` and the dashboard's events re-subscribe can replay the
in-progress state. These helpers pin the snapshot contract:

* ``_start_inflight_turn`` seeds empty ``thinking`` / ``tools`` accumulators.
* ``_append_inflight_thinking`` / ``_thinking_emit`` accumulate reasoning.
* ``_record_inflight_tool_start`` / ``_record_inflight_tool_complete`` track
  tool lifecycle (running → complete/error) on the turn.
* ``_inflight_snapshot`` exposes ``thinking`` / ``tools`` only when non-empty,
  so the healthy-text-only shape is unchanged.
"""

from __future__ import annotations

import threading
import types

import pytest

from tui_gateway import server


def _session(agent=None, **extra):
    return {
        "agent": agent if agent is not None else types.SimpleNamespace(),
        "session_key": "session-key",
        "history": [],
        "history_lock": threading.Lock(),
        "history_version": 0,
        "running": False,
        "attached_images": [],
        "image_counter": 0,
        "cols": 80,
        "slash_worker": None,
        "show_reasoning": False,
        "tool_progress_mode": "all",
        "inflight_turn": None,
        **extra,
    }


# ── Unit: accumulator helpers ─────────────────────────────────────────

def test_start_inflight_turn_seeds_thinking_and_tools():
    session = _session()
    server._start_inflight_turn(session, "go")
    turn = session["inflight_turn"]
    assert turn["thinking"] == ""
    assert turn["tools"] == []
    assert turn["assistant"] == ""
    assert turn["user"] == "go"


def test_append_inflight_thinking_accumulates_and_snapshot_carries_it():
    session = _session()
    server._start_inflight_turn(session, "go")
    server._append_inflight_thinking(session, "let me think")
    server._append_inflight_thinking(session, "… harder")
    server._append_inflight_delta(session, "partial reply")

    snapshot = server._inflight_snapshot(session)
    assert snapshot is not None
    assert snapshot["thinking"] == "let me think… harder"
    assert snapshot["assistant"] == "partial reply"


def test_append_inflight_thinking_ignores_empty():
    session = _session()
    server._start_inflight_turn(session, "go")
    server._append_inflight_thinking(session, "")
    server._append_inflight_thinking(session, None)
    snapshot = server._inflight_snapshot(session)
    assert snapshot is not None
    assert "thinking" not in snapshot


def test_tool_lifecycle_recorded_and_snapshot_carries_statuses():
    session = _session()
    server._start_inflight_turn(session, "go")
    server._record_inflight_tool_start(session, "t1", "read_file", '{"path":"x"}')
    server._record_inflight_tool_start(session, "t2", "web_search", "")

    snapshot = server._inflight_snapshot(session)
    assert snapshot is not None
    tools = snapshot["tools"]
    assert len(tools) == 2
    assert tools[0] == {
        "tool_id": "t1",
        "name": "read_file",
        "args_text": '{"path":"x"}',
        "status": "running",
    }

    server._record_inflight_tool_complete(session, "t1", summary="done", duration_s=1.2)
    snapshot = server._inflight_snapshot(session)
    t1 = next(t for t in snapshot["tools"] if t["tool_id"] == "t1")
    assert t1["status"] == "complete"
    assert t1["summary"] == "done"
    assert t1["duration_s"] == 1.2
    t2 = next(t for t in snapshot["tools"] if t["tool_id"] == "t2")
    assert t2["status"] == "running"


def test_tool_complete_marks_error():
    session = _session()
    server._start_inflight_turn(session, "go")
    server._record_inflight_tool_start(session, "t1", "terminal", "")
    server._record_inflight_tool_complete(session, "t1", error="exit 1")
    snapshot = server._inflight_snapshot(session)
    t1 = snapshot["tools"][0]
    assert t1["status"] == "error"
    assert t1["error"] == "exit 1"


# ── Unit: _thinking_emit accumulates AND emits ─────────────────────────

def test_thinking_emit_accumulates_and_emits(monkeypatch):
    captured: list = []
    monkeypatch.setattr(
        server,
        "_emit",
        lambda event, sid, payload=None: captured.append((event, sid, payload)),
    )
    session = _session()
    server._sessions["sid-1"] = session
    server._start_inflight_turn(session, "go")
    try:
        server._thinking_emit("sid-1", "step one")
        server._thinking_emit("sid-1", "step two")
    finally:
        server._sessions.pop("sid-1", None)

    events = [e for e, _s, _p in captured]
    assert events == ["thinking.delta", "thinking.delta"]
    assert session["inflight_turn"]["thinking"] == "step onestep two"


def test_reasoning_emit_uses_reasoning_event(monkeypatch):
    captured: list = []
    monkeypatch.setattr(
        server,
        "_emit",
        lambda event, sid, payload=None: captured.append((event, sid, payload)),
    )
    session = _session()
    server._sessions["sid-2"] = session
    server._start_inflight_turn(session, "go")
    try:
        server._thinking_emit("sid-2", "deep thought", reasoning=True)
    finally:
        server._sessions.pop("sid-2", None)

    assert captured == [("reasoning.delta", "sid-2", {"text": "deep thought"})]
    assert session["inflight_turn"]["thinking"] == "deep thought"


# ── Unit: snapshot healthy shape is unchanged without extras ───────────

def test_healthy_snapshot_omits_empty_thinking_and_tools():
    session = _session()
    server._start_inflight_turn(session, "hi")
    server._append_inflight_delta(session, "hello")
    snapshot = server._inflight_snapshot(session)
    assert snapshot == {
        "assistant": "hello",
        "streaming": True,
        "user": "hi",
        "segments": [{"kind": "text", "text": "hello"}],
    }
