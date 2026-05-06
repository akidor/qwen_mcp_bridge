"""Tool dispatch 결과 텍스트 후처리 helper.

bridge가 mcp pool로 부른 도구 결과(텍스트)를 byte 길이로 검사해
모델 컨텍스트를 보호하기 위한 max-size guard 제공.
"""
from __future__ import annotations


def truncate_tool_text(text: str, max_bytes: int) -> str:
    """text가 max_bytes 초과면 잘라서 한국어 hint를 append.

    - max_bytes <= 0: disabled, 원본 그대로.
    - 한국어 multi-byte: byte slice 후 UTF-8 invalid trailing byte 안전 제거.
    """
    if max_bytes <= 0:
        return text
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text

    truncated_bytes = encoded[:max_bytes]
    while truncated_bytes:
        try:
            truncated_text = truncated_bytes.decode("utf-8")
            break
        except UnicodeDecodeError:
            truncated_bytes = truncated_bytes[:-1]
    else:
        truncated_text = ""

    hint = (
        f"\n\n[브릿지 알림: 결과가 {len(encoded)}바이트에서 {len(truncated_bytes)}바이트로 잘렸습니다. "
        f"더 구체적인 필터(top_n / only_restrict='가능' / target_keyword='...' / "
        f"omit_geometry=true / omit_verbose_props=true 등)를 사용하면 전체 데이터가 들어갑니다.]"
    )
    return truncated_text + hint
