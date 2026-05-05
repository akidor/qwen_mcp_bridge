"""환경 변수 로딩."""
from __future__ import annotations
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    vllm_base_url: str = "http://localhost:8016/v1"
    vllm_api_key: str = "unused"
    vllm_model: str = "sakamakismile/Qwen3.6-35B-A3B-NVFP4"

    urban_mcp_root: str = "/home/akidor/urban_mcp"

    bind_host: str = "0.0.0.0"
    bind_port: int = 8090

    max_tool_iterations: int = 5
    vllm_timeout: float = 120.0
    mcp_tool_timeout: float = 60.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
