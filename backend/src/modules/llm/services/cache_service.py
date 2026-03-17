import json
import hashlib
from typing import Optional, Dict, Any
import redis.asyncio as redis

from ..config import config

class CacheService:
    """
    Redis-based caching for prompt templates and extraction results
    """
    
    def __init__(self):
        self.enabled = config.enable_caching
        if self.enabled:
            self.redis_client = redis.from_url(
                config.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
        else:
            self.redis_client = None
    
    async def get_cached_extraction(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached extraction result
        
        Args:
            cache_key: Cache key (hash of input narrative + context)
        
        Returns:
            Cached extraction data or None if not found
        """
        if not self.enabled or not self.redis_client:
            return None
        
        try:
            cached_data = await self.redis_client.get(f"extraction:{cache_key}")
            if cached_data:
                return json.loads(cached_data)
            return None
        except Exception:
            # Cache failures should not break extraction flow
            return None
    
    async def cache_extraction(
        self,
        cache_key: str,
        extraction_data: Dict[str, Any],
        ttl_seconds: int = 900  # 15 minutes
    ) -> bool:
        """
        Cache extraction result
        
        Args:
            cache_key: Cache key
            extraction_data: Extracted claim data
            ttl_seconds: Time-to-live in seconds (default 15 min)
        
        Returns:
            True if cached successfully, False otherwise
        """
        if not self.enabled or not self.redis_client:
            return False
        
        try:
            await self.redis_client.setex(
                f"extraction:{cache_key}",
                ttl_seconds,
                json.dumps(extraction_data)
            )
            return True
        except Exception:
            return False
    
    @staticmethod
    def generate_cache_key(
        narrative: str,
        language: str,
        channel: str,
        incident_date: Optional[str] = None,
        location: Optional[str] = None
    ) -> str:
        """
        Generate deterministic cache key from input parameters
        
        Args:
            narrative: FNOL narrative
            language: Input language
            channel: Submission channel
            incident_date: Optional incident date
            location: Optional location
        
        Returns:
            SHA256 hash as cache key
        """
        cache_input = f"{narrative}|{language}|{channel}|{incident_date}|{location}"
        return hashlib.sha256(cache_input.encode('utf-8')).hexdigest()
    
    async def close(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.close()