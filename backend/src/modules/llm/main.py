from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
import time
import logging

from .services.llm_client import LLMClient
from .services.cache_service import CacheService
from .config import config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Roojai Claims LLM Extraction Service",
    version="1.0.0",
    description="Thai/English bilingual claim data extraction using LLM"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure based on environment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
llm_client = LLMClient()
cache_service = CacheService()

# Request/Response Models
class ExtractionRequest(BaseModel):
    narrative: str = Field(..., min_length=20, description="FNOL narrative (min 20 chars)")
    language: str = Field(default='th', description="Input language: th, en, tinglish")
    channel: str = Field(default='web', description="Submission channel: chat, email, web")
    incident_date: Optional[str] = Field(None, description="Pre-filled incident date (ISO 8601)")
    location: Optional[str] = Field(None, description="Pre-filled location")
    police_report_filed: Optional[bool] = Field(None, description="Pre-filled police report status")
    
    @validator('language')
    def validate_language(cls, v):
        if v not in ['th', 'en', 'tinglish']:
            raise ValueError("Language must be 'th', 'en', or 'tinglish'")
        return v
    
    @validator('channel')
    def validate_channel(cls, v):
        if v not in ['chat', 'email', 'web']:
            raise ValueError("Channel must be 'chat', 'email', or 'web'")
        return v

class ExtractionResponse(BaseModel):
    vehicles: List[Dict[str, Any]]
    incident_details: Dict[str, Any]
    parties: List[Dict[str, Any]]
    injuries: Dict[str, Any]
    police_report: Dict[str, Any]
    overall_confidence: float
    missing_critical_fields: List[str]
    ambiguous_information: List[str]
    language_detected: str
    metadata: Dict[str, Any]

@app.post("/api/v1/llm/extract", response_model=ExtractionResponse)
async def extract_claim_data(request: ExtractionRequest):
    """
    Extract structured claim data from unstructured FNOL narrative
    
    - **narrative**: FNOL narrative text (Thai/English/Tinglish, min 20 chars)
    - **language**: Input language ('th', 'en', 'tinglish')
    - **channel**: Submission channel ('chat', 'email', 'web')
    - **incident_date**: Optional pre-filled incident date
    - **location**: Optional pre-filled location
    - **police_report_filed**: Optional pre-filled police report status
    
    Returns structured claim data with confidence scores
    """
    start_time = time.time()
    
    try:
        # Generate cache key
        cache_key = CacheService.generate_cache_key(
            narrative=request.narrative,
            language=request.language,
            channel=request.channel,
            incident_date=request.incident_date,
            location=request.location
        )
        
        # Check cache
        cached_result = await cache_service.get_cached_extraction(cache_key)
        if cached_result:
            logger.info(f"Cache hit for extraction: {cache_key[:16]}...")
            cached_result['metadata']['cache_hit'] = True
            return ExtractionResponse(**cached_result)
        
        # Call LLM
        logger.info(f"Extracting claim data (language: {request.language}, channel: {request.channel})")
        extracted_data = await llm_client.extract_claim_data(
            narrative=request.narrative,
            language=request.language,
            channel=request.channel,
            incident_date=request.incident_date,
            location=request.location,
            police_report_filed=request.police_report_filed
        )
        
        # Validate schema
        if not llm_client.validate_extraction_schema(extracted_data):
            raise ValueError("LLM returned invalid extraction schema")
        
        # Cache result
        await cache_service.cache_extraction(cache_key, extracted_data)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        extracted_data['_metadata']['total_processing_time_ms'] = processing_time_ms
        extracted_data['_metadata']['cache_hit'] = False
        
        logger.info(f"Extraction completed in {processing_time_ms}ms (confidence: {extracted_data['overall_confidence']:.2f})")
        
        # Rename _metadata to metadata for response
        extracted_data['metadata'] = extracted_data.pop('_metadata')
        
        return ExtractionResponse(**extracted_data)
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        processing_time_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Extraction failed after {processing_time_ms}ms: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"LLM extraction failed: {str(e)}"
        )

@app.get("/api/v1/llm/health")
async def health_check():
    """
    Health check endpoint for LLM service
    """
    return {
        "status": "healthy",
        "provider": config.provider,
        "model_version": config.model_version,
        "cache_enabled": config.enable_caching,
        "timeout_seconds": config.timeout_seconds
    }

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    await cache_service.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)