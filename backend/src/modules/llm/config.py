import os
from typing import Literal
from pydantic import BaseModel, Field

class LLMConfig(BaseModel):
    """LLM service configuration"""
    provider: Literal['openai', 'anthropic'] = Field(
        default=os.getenv('LLM_PROVIDER', 'openai'),
        description="LLM provider to use"
    )
    model_version: str = Field(
        default=os.getenv('LLM_MODEL_VERSION', 'gpt-4-turbo-2024-01-25'),
        description="Model version identifier"
    )
    api_key: str = Field(
        default=os.getenv('LLM_API_KEY', ''),
        description="API key for LLM provider"
    )
    timeout_seconds: int = Field(
        default=int(os.getenv('LLM_TIMEOUT_SECONDS', '25')),
        description="Request timeout (must be <30s for intake SLA)"
    )
    max_retries: int = Field(
        default=int(os.getenv('LLM_MAX_RETRIES', '3')),
        description="Maximum retry attempts for transient failures"
    )
    temperature: float = Field(
        default=float(os.getenv('LLM_TEMPERATURE', '0.1')),
        description="Temperature for extraction (low for consistency)"
    )
    max_tokens: int = Field(
        default=int(os.getenv('LLM_MAX_TOKENS', '2000')),
        description="Maximum tokens in response"
    )
    redis_url: str = Field(
        default=os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        description="Redis URL for prompt template caching"
    )
    enable_caching: bool = Field(
        default=os.getenv('ENABLE_PROMPT_CACHING', 'true').lower() == 'true',
        description="Enable Redis caching for prompt templates"
    )

# Global config instance
config = LLMConfig()