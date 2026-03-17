"""
Thai-Friendly Clarifying Questions Generation Service
FastAPI service that generates conversational Thai questions for missing FNOL data
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import httpx
import os
import time
import logging
from datetime import datetime
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Thai-Friendly Questions Service",
    description="Generate conversational Thai clarifying questions for missing FNOL data",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")  # openai or anthropic
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4")
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT_MS", "25000")) / 1000  # Convert to seconds
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Import Redis client
try:
    import redis
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    REDIS_AVAILABLE = True
except Exception as e:
    logger.warning(f"Redis not available: {e}")
    REDIS_AVAILABLE = False
    redis_client = None


# Request/Response Models
class MissingField(BaseModel):
    field: str
    criticality: str
    reason: str
    context: Optional[Dict[str, Any]] = None


class GenerateQuestionsRequest(BaseModel):
    claim_id: str = Field(..., description="Unique claim identifier")
    language: str = Field(..., description="Target language (th or en)")
    missing_fields: List[MissingField] = Field(..., description="List of missing fields")
    claim_context: Dict[str, Any] = Field(..., description="Claim context for question generation")
    
    @validator('language')
    def validate_language(cls, v):
        if v not in ['th', 'en']:
            raise ValueError('Language must be "th" or "en"')
        return v
    
    @validator('missing_fields')
    def validate_missing_fields_count(cls, v):
        if len(v) == 0:
            raise ValueError('At least one missing field required')
        return v


class ClarifyingQuestion(BaseModel):
    question_th: str
    question_en: str
    field: str
    generation_rationale: str


class GenerateQuestionsResponse(BaseModel):
    claim_id: str
    questions: List[ClarifyingQuestion]
    processing_time_ms: int
    llm_model_version: str


# Thai-friendly question templates (cached in Redis)
QUESTION_TEMPLATES = {
    "policyNumber": {
        "th": "ขอเลขกรมธรรม์ประกันภัยของคุณหน่อยครับ/ค่ะ (10 หลัก)",
        "en": "Could you please provide your insurance policy number? (10 digits)",
        "context_needed": False
    },
    "incidentDate": {
        "th": "เกิดอุบัติเหตุเมื่อไหร่ครับ/ค่ะ? (วันที่และเวลา)",
        "en": "When did the accident happen? (date and time)",
        "context_needed": False
    },
    "incidentLocation": {
        "th": "เกิดเหตุที่ไหนครับ/ค่ะ? (ถนน/แยก/จังหวัด หรือส่งพิกัด GPS)",
        "en": "Where did the accident occur? (street/intersection/province or GPS coordinates)",
        "context_needed": False
    },
    "vehicles[0].licensePlate": {
        "th": "ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?",
        "en": "What is your vehicle's license plate number?",
        "context_needed": False
    },
    "vehicles[0].make": {
        "th": "รถของคุณยี่ห้ออะไรครับ/ค่ะ? (เช่น Toyota, Honda, Isuzu)",
        "en": "What is your vehicle's make? (e.g., Toyota, Honda, Isuzu)",
        "context_needed": False
    },
    "vehicles[0].model": {
        "th": "รุ่นรถอะไรครับ/ค่ะ? (เช่น Camry, Civic, D-Max)",
        "en": "What is your vehicle's model? (e.g., Camry, Civic, D-Max)",
        "context_needed": False
    },
    "vehicles[0].vin": {
        "th": "ขอเลขตัวถัง (VIN) 17 หลักด้วยครับ/ค่ะ (ดูได้จากเล่มทะเบียนรถ)",
        "en": "Could you provide the 17-digit VIN number? (found in vehicle registration)",
        "context_needed": False
    },
    "vehicles[0].damageDescription": {
        "th": "รถเสียหายตรงไหนบ้างครับ/ค่ะ? (เช่น กันชนหน้า, ประตูซ้าย, กระจก)",
        "en": "Which parts of the vehicle are damaged? (e.g., front bumper, left door, windshield)",
        "context_needed": True
    },
    "policeReportNumber": {
        "th": "มีเลขที่รายงานตำรวจไหมครับ/ค่ะ? (ถ้าแจ้งความแล้ว)",
        "en": "Do you have a police report number? (if reported)",
        "context_needed": True
    },
    "narrative": {
        "th": "ช่วยเล่าว่าเกิดอะไรขึ้นหน่อยครับ/ค่ะ (อุบัติเหตุเกิดยังไง มีใครบาดเจ็บไหม)",
        "en": "Could you describe what happened? (how the accident occurred, any injuries)",
        "context_needed": False
    }
}


def get_cached_template(field: str) -> Optional[Dict[str, Any]]:
    """Retrieve question template from Redis cache"""
    if not REDIS_AVAILABLE:
        return QUESTION_TEMPLATES.get(field)
    
    try:
        cache_key = f"question_template:{field}"
        cached = redis_client.get(cache_key)
        if cached:
            logger.info(f"Cache hit for template: {field}")
            return json.loads(cached)
        
        # Cache miss - store template
        template = QUESTION_TEMPLATES.get(field)
        if template:
            redis_client.setex(cache_key, 900, json.dumps(template))  # 15-minute TTL
            logger.info(f"Cached template: {field}")
        return template
    except Exception as e:
        logger.error(f"Redis error: {e}")
        return QUESTION_TEMPLATES.get(field)


def build_llm_prompt(missing_fields: List[MissingField], claim_context: Dict[str, Any], language: str) -> str:
    """Build LLM prompt for generating Thai-friendly questions"""
    
    # Extract relevant context
    narrative = claim_context.get('narrative', '')
    injuries_reported = claim_context.get('injuriesReported', False)
    police_filed = claim_context.get('policeReportFiled', False)
    
    prompt = f"""You are a helpful Thai insurance claims assistant. Generate exactly 3 conversational clarifying questions in Thai to collect missing information from a customer who submitted an accident claim.

CRITICAL RULES:
1. Use CONVERSATIONAL Thai language (ภาษาพูด), NOT formal insurance terminology
2. Use polite particles: ครับ/ค่ะ at the end of questions
3. Keep questions SHORT and SIMPLE (max 20 Thai words)
4. Provide examples in parentheses when helpful (e.g., "ยี่ห้ออะไร? (เช่น Toyota, Honda)")
5. Generate EXACTLY 3 questions, prioritizing CRITICAL fields first
6. Each question must target ONE specific missing field
7. Provide both Thai (question_th) and English (question_en) versions

CLAIM CONTEXT:
- Narrative: {narrative[:200] if narrative else 'Not provided'}
- Injuries reported: {injuries_reported}
- Police report filed: {police_filed}

MISSING FIELDS (prioritized by criticality):
"""
    
    for i, field in enumerate(missing_fields[:5], 1):  # Show top 5 for context
        prompt += f"{i}. {field.field} (criticality: {field.criticality})\n   Reason: {field.reason}\n"
    
    prompt += f"""
TARGET LANGUAGE: {language}

OUTPUT FORMAT (JSON):
{{
  "questions": [
    {{
      "question_th": "Thai conversational question here ครับ/ค่ะ",
      "question_en": "English translation here",
      "field": "exact field name from missing fields",
      "generation_rationale": "Why this question was prioritized"
    }}
  ]
}}

Generate exactly 3 questions now:"""
    
    return prompt


async def call_llm_api(prompt: str) -> Dict[str, Any]:
    """Call LLM API (OpenAI or Anthropic) with timeout"""
    
    start_time = time.time()
    
    try:
        if LLM_PROVIDER == "openai":
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {LLM_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": LLM_MODEL,
                        "messages": [
                            {"role": "system", "content": "You are a Thai insurance claims assistant specializing in conversational question generation."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3,  # Lower temperature for consistent formatting
                        "max_tokens": 1000
                    }
                )
                response.raise_for_status()
                result = response.json()
                
                # Extract JSON from response
                content = result['choices'][0]['message']['content']
                
                # Parse JSON response
                if '```json' in content:
                    content = content.split('```json')[1].split('```')[0].strip()
                elif '```' in content:
                    content = content.split('```')[1].split('```')[0].strip()
                
                parsed = json.loads(content)
                
                processing_time = int((time.time() - start_time) * 1000)
                logger.info(f"LLM API call successful in {processing_time}ms")
                
                return {
                    "questions": parsed.get("questions", []),
                    "model_version": LLM_MODEL,
                    "processing_time_ms": processing_time
                }
                
        elif LLM_PROVIDER == "anthropic":
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": LLM_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "claude-3-sonnet-20240229",
                        "max_tokens": 1000,
                        "temperature": 0.3,
                        "messages": [
                            {"role": "user", "content": prompt}
                        ]
                    }
                )
                response.raise_for_status()
                result = response.json()
                
                content = result['content'][0]['text']
                
                # Parse JSON response
                if '```json' in content:
                    content = content.split('```json')[1].split('```')[0].strip()
                elif '```' in content:
                    content = content.split('```')[1].split('```')[0].strip()
                
                parsed = json.loads(content)
                
                processing_time = int((time.time() - start_time) * 1000)
                logger.info(f"LLM API call successful in {processing_time}ms")
                
                return {
                    "questions": parsed.get("questions", []),
                    "model_version": "claude-3-sonnet",
                    "processing_time_ms": processing_time
                }
        else:
            raise ValueError(f"Unsupported LLM provider: {LLM_PROVIDER}")
            
    except httpx.TimeoutException:
        logger.error(f"LLM API timeout after {LLM_TIMEOUT}s")
        raise HTTPException(status_code=504, detail="LLM service timeout")
    except httpx.HTTPStatusError as e:
        logger.error(f"LLM API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=502, detail="LLM service error")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response: {e}")
        raise HTTPException(status_code=500, detail="Invalid LLM response format")
    except Exception as e:
        logger.error(f"Unexpected error calling LLM: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def generate_fallback_questions(missing_fields: List[MissingField], language: str) -> List[ClarifyingQuestion]:
    """Generate questions using cached templates as fallback"""
    
    questions = []
    
    # Prioritize by criticality
    sorted_fields = sorted(missing_fields, key=lambda x: 0 if x.criticality == 'CRITICAL' else 1)
    
    for field in sorted_fields[:3]:  # Take top 3
        template = get_cached_template(field.field)
        
        if template:
            questions.append(ClarifyingQuestion(
                question_th=template['th'],
                question_en=template['en'],
                field=field.field,
                generation_rationale=f"Template-based question for {field.criticality} field: {field.reason}"
            ))
        else:
            # Generic fallback
            if language == 'th':
                questions.append(ClarifyingQuestion(
                    question_th=f"ช่วยให้ข้อมูล {field.field} หน่อยครับ/ค่ะ",
                    question_en=f"Could you please provide {field.field}?",
                    field=field.field,
                    generation_rationale=f"Generic fallback for {field.field}"
                ))
            else:
                questions.append(ClarifyingQuestion(
                    question_th=f"ช่วยให้ข้อมูล {field.field} หน่อยครับ/ค่ะ",
                    question_en=f"Could you please provide {field.field}?",
                    field=field.field,
                    generation_rationale=f"Generic fallback for {field.field}"
                ))
    
    return questions[:3]  # Ensure exactly 3


@app.post("/api/v1/questions/generate", response_model=GenerateQuestionsResponse)
async def generate_questions(request: GenerateQuestionsRequest):
    """
    Generate exactly 3 Thai-friendly clarifying questions for missing FNOL data
    
    Uses LLM for context-aware question generation with template fallback
    """
    start_time = time.time()
    
    logger.info(f"Generating questions for claim {request.claim_id}, language: {request.language}")
    
    try:
        # Build LLM prompt
        prompt = build_llm_prompt(request.missing_fields, request.claim_context, request.language)
        
        # Call LLM API
        try:
            llm_result = await call_llm_api(prompt)
            
            # Validate we got exactly 3 questions
            questions_data = llm_result['questions']
            if len(questions_data) != 3:
                logger.warning(f"LLM returned {len(questions_data)} questions, expected 3. Using fallback.")
                raise ValueError("Invalid question count")
            
            # Parse questions
            questions = [
                ClarifyingQuestion(
                    question_th=q['question_th'],
                    question_en=q['question_en'],
                    field=q['field'],
                    generation_rationale=q.get('generation_rationale', 'LLM-generated question')
                )
                for q in questions_data
            ]
            
            model_version = llm_result['model_version']
            
        except Exception as e:
            logger.warning(f"LLM generation failed: {e}. Using template fallback.")
            questions = generate_fallback_questions(request.missing_fields, request.language)
            model_version = "template-fallback"
        
        total_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Generated {len(questions)} questions in {total_time}ms")
        
        return GenerateQuestionsResponse(
            claim_id=request.claim_id,
            questions=questions,
            processing_time_ms=total_time,
            llm_model_version=model_version
        )
        
    except Exception as e:
        logger.error(f"Error generating questions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    
    redis_status = "up" if REDIS_AVAILABLE else "down"
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "redis": redis_status,
            "llm_provider": LLM_PROVIDER
        },
        "version": "1.0.0"
    }


@app.post("/api/v1/admin/cache/invalidate")
async def invalidate_cache(cache_keys: List[str]):
    """Invalidate question template cache (admin endpoint)"""
    
    if not REDIS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Redis not available")
    
    try:
        invalidated = []
        for key in cache_keys:
            full_key = f"question_template:{key}"
            redis_client.delete(full_key)
            invalidated.append(key)
        
        logger.info(f"Invalidated cache keys: {invalidated}")
        
        return {
            "invalidated_keys": invalidated,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Cache invalidation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)