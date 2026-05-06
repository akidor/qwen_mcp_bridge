from qwen_mcp_bridge._tool_result import truncate_tool_text


def test_truncate_below_threshold_unchanged():
    text = "안녕"
    out = truncate_tool_text(text, max_bytes=1000)
    assert out == text


def test_truncate_zero_threshold_means_disabled():
    text = "x" * 10000
    out = truncate_tool_text(text, max_bytes=0)
    assert out == text


def test_truncate_above_threshold_appends_hint():
    text = "x" * 5000
    out = truncate_tool_text(text, max_bytes=1000)
    assert len(out.encode("utf-8")) <= 1000 + 500  # truncated body + hint
    assert "잘렸" in out
    assert "5000" in out  # 원본 byte 수 표시


def test_truncate_korean_text_handles_multibyte_safely():
    # 한국어 한 글자 = 3 bytes. byte 자르기에서 다음 줄에서 깨지지 않음.
    text = "한" * 1000  # 3000 bytes
    out = truncate_tool_text(text, max_bytes=300)
    encoded = out.encode("utf-8")
    decoded = encoded.decode("utf-8")
    assert decoded == out
    assert "잘렸" in out
