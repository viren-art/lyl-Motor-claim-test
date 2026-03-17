from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
import anthropic
import openai
import os
import time
import logging
from datetime import datetime
import json
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Roojai LLM Extraction Service", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# LLM Configuration
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude")  # claude or openai
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT_SECONDS", "10"))
LLM_MODEL_VERSION = os.getenv("LLM_MODEL_VERSION", "claude-3-sonnet-20240229")

# Initialize clients
claude_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None
openai.api_key = OPENAI_API_KEY if OPENAI_API_KEY else None


class ExtractionRequest(BaseModel):
    claim_id: str = Field(..., description="Claim reference ID")
    narrative: str = Field(..., min_length=20, description="Accident narrative in Thai/English/Tinglish")
    language: str = Field(default="th", description="Primary language: th, en")
    incident_date: Optional[str] = Field(None, description="ISO 8601 incident date if provided")
    incident_location: Optional[Dict[str, Any]] = Field(None, description="Location data if provided")
    police_report_filed: Optional[bool] = Field(None, description="Police report status if known")
    injuries_reported: Optional[bool] = Field(None, description="Injury status if known")
    
    @validator('language')
    def validate_language(cls, v):
        if v not in ['th', 'en']:
            raise ValueError('Language must be th or en')
        return v


class VehicleDetails(BaseModel):
    role: str  # INSURED or THIRD_PARTY
    license_plate: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = None
    damage_description: Optional[str] = None
    confidence_score: float = Field(ge=0.0, le=1.0)


class LocationDetails(BaseModel):
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    confidence_score: float = Field(ge=0.0, le=1.0)


class PartyDetails(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: str  # DRIVER, PASSENGER, WITNESS, THIRD_PARTY
    confidence_score: float = Field(ge=0.0, le=1.0)


class ExtractionResponse(BaseModel):
    claim_id: str
    fnol_summary: str
    vehicles: List[VehicleDetails]
    location: LocationDetails
    parties: List[PartyDetails]
    incident_time: Optional[str] = None
    injuries_reported: Optional[bool] = None
    injury_description: Optional[str] = None
    police_report_filed: Optional[bool] = None
    police_report_number: Optional[str] = None
    damage_narrative: str
    missing_fields: List[str]
    overall_confidence_score: float = Field(ge=0.0, le=1.0)
    llm_model_version: str
    processing_time_ms: int
    evidence_quotes: List[str]


def build_extraction_prompt(request: ExtractionRequest) -> str:
    """
    Build structured prompt for Thai/English extraction
    """
    if request.language == 'th':
        system_prompt = """คุณเป็นผู้เชี่ยวชาญด้านการประมวลผลข้อมูลอุบัติเหตุรถยนต์สำหรับบริษัทประกันภัยในประเทศไทย

งานของคุณคือการแยกข้อมูลที่มีโครงสร้างจากคำบรรยายอุบัติเหตุที่ลูกค้าให้มา โดยต้องระบุความมั่นใจในแต่ละข้อมูลที่แยกออกมา

กฎสำคัญ:
1. ห้ามสร้างข้อมูลที่ไม่มีในคำบรรยาย - ถ้าไม่แน่ใจให้ใส่ null และลดคะแนนความมั่นใจ
2. รองรับภาษาไทย อังกฤษ และ Tinglish (ภาษาไทยผสมอังกฤษ)
3. ระบุความมั่นใจ (0.0-1.0) สำหรับแต่ละข้อมูล
4. แยกข้อมูลรถที่เอาประกัน (INSURED) และรถคู่กรณี (THIRD_PARTY)
5. ระบุฟิลด์ที่ขาดหายไปซึ่งจำเป็นสำหรับการประมวลผลเคลม

ส่งคืนข้อมูลในรูปแบบ JSON เท่านั้น"""
        
        user_prompt = f"""วิเคราะห์คำบรรยายอุบัติเหตุต่อไปนี้และแยกข้อมูลที่มีโครงสร้าง:

คำบรรยาย: {request.narrative}

ข้อมูลเพิ่มเติม:
- วันที่เกิดเหตุ: {request.incident_date or 'ไม่ระบุ'}
- สถานที่: {json.dumps(request.incident_location, ensure_ascii=False) if request.incident_location else 'ไม่ระบุ'}
- แจ้งความ: {request.police_report_filed if request.police_report_filed is not None else 'ไม่ระบุ'}
- มีผู้บาดเจ็บ: {request.injuries_reported if request.injuries_reported is not None else 'ไม่ระบุ'}

ส่งคืนข้อมูลในรูปแบบ JSON ตามโครงสร้างนี้:
{{
  "fnol_summary": "สรุปอุบัติเหตุ 2-3 ประโยค",
  "vehicles": [
    {{
      "role": "INSURED" หรือ "THIRD_PARTY",
      "license_plate": "ทะเบียนรถ หรือ null",
      "make": "ยี่ห้อรถ หรือ null",
      "model": "รุ่นรถ หรือ null",
      "year": ปีรถ หรือ null,
      "color": "สีรถ หรือ null",
      "damage_description": "รายละเอียดความเสียหาย",
      "confidence_score": 0.0-1.0
    }}
  ],
  "location": {{
    "address": "ที่อยู่ หรือ null",
    "lat": latitude หรือ null,
    "lng": longitude หรือ null,
    "confidence_score": 0.0-1.0
  }},
  "parties": [
    {{
      "name": "ชื่อ หรือ null",
      "phone": "เบอร์โทร หรือ null",
      "role": "DRIVER/PASSENGER/WITNESS/THIRD_PARTY",
      "confidence_score": 0.0-1.0
    }}
  ],
  "incident_time": "เวลาที่เกิดเหตุ ISO 8601 หรือ null",
  "injuries_reported": true/false/null,
  "injury_description": "รายละเอียดการบาดเจ็บ หรือ null",
  "police_report_filed": true/false/null,
  "police_report_number": "เลขที่แจ้งความ หรือ null",
  "damage_narrative": "คำบรรยายความเสียหาย",
  "missing_fields": ["รายการฟิลด์ที่ขาดหายไป"],
  "overall_confidence_score": 0.0-1.0,
  "evidence_quotes": ["ประโยคจากคำบรรยายที่ใช้ในการตัดสินใจ"]
}}"""
    else:
        system_prompt = """You are an expert motor insurance claims processor for a Thai insurance company.

Your task is to extract structured data from customer accident narratives with confidence scoring for each field.

Critical rules:
1. NEVER hallucinate data - if unsure, use null and lower confidence score
2. Support Thai, English, and Tinglish (Thai-English code-switching)
3. Provide confidence scores (0.0-1.0) for each extracted field
4. Distinguish between INSURED vehicle and THIRD_PARTY vehicle
5. Identify missing mandatory fields required for claim processing

Return data in JSON format only."""
        
        user_prompt = f"""Analyze the following accident narrative and extract structured data:

Narrative: {request.narrative}

Additional context:
- Incident date: {request.incident_date or 'Not specified'}
- Location: {json.dumps(request.incident_location) if request.incident_location else 'Not specified'}
- Police report filed: {request.police_report_filed if request.police_report_filed is not None else 'Not specified'}
- Injuries reported: {request.injuries_reported if request.injuries_reported is not None else 'Not specified'}

Return JSON following this structure:
{{
  "fnol_summary": "2-3 sentence accident summary",
  "vehicles": [
    {{
      "role": "INSURED" or "THIRD_PARTY",
      "license_plate": "plate number or null",
      "make": "vehicle make or null",
      "model": "vehicle model or null",
      "year": year or null,
      "color": "color or null",
      "damage_description": "damage details",
      "confidence_score": 0.0-1.0
    }}
  ],
  "location": {{
    "address": "address or null",
    "lat": latitude or null,
    "lng": longitude or null,
    "confidence_score": 0.0-1.0
  }},
  "parties": [
    {{
      "name": "name or null",
      "phone": "phone or null",
      "role": "DRIVER/PASSENGER/WITNESS/THIRD_PARTY",
      "confidence_score": 0.0-1.0
    }}
  ],
  "incident_time": "ISO 8601 time or null",
  "injuries_reported": true/false/null,
  "injury_description": "injury details or null",
  "police_report_filed": true/false/null,
  "police_report_number": "report number or null",
  "damage_narrative": "damage description",
  "missing_fields": ["list of missing mandatory fields"],
  "overall_confidence_score": 0.0-1.0,
  "evidence_quotes": ["quotes from narrative supporting decisions"]
}}"""
    
    return system_prompt, user_prompt


def call_claude_api(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    """
    Call Claude API with timeout handling
    """
    try:
        start_time = time.time()
        
        message = claude_client.messages.create(
            model=LLM_MODEL_VERSION,
            max_tokens=4096,
            temperature=0.3,  # Lower temperature for more deterministic extraction
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ],
            timeout=LLM_TIMEOUT
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Extract JSON from response
        response_text = message.content[0].text
        
        # Try to parse JSON from response
        # Claude sometimes wraps JSON in markdown code blocks
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        
        extracted_data = json.loads(response_text)
        
        return {
            "data": extracted_data,
            "processing_time_ms": processing_time,
            "model_version": LLM_MODEL_VERSION
        }
        
    except anthropic.APITimeoutError:
        logger.error(f"Claude API timeout after {LLM_TIMEOUT} seconds")
        raise HTTPException(status_code=504, detail="LLM service timeout")
    except anthropic.APIError as e:
        logger.error(f"Claude API error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {str(e)}")
        raise HTTPException(status_code=500, detail="Invalid LLM response format")


def call_openai_api(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    """
    Call OpenAI GPT-4 API with timeout handling
    """
    try:
        start_time = time.time()
        
        response = openai.ChatCompletion.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=4096,
            timeout=LLM_TIMEOUT,
            response_format={"type": "json_object"}
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        response_text = response.choices[0].message.content
        extracted_data = json.loads(response_text)
        
        return {
            "data": extracted_data,
            "processing_time_ms": processing_time,
            "model_version": response.model
        }
        
    except openai.error.Timeout:
        logger.error(f"OpenAI API timeout after {LLM_TIMEOUT} seconds")
        raise HTTPException(status_code=504, detail="LLM service timeout")
    except openai.error.APIError as e:
        logger.error(f"OpenAI API error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {str(e)}")
        raise HTTPException(status_code=500, detail="Invalid LLM response format")


@app.post("/api/v1/llm/extract", response_model=ExtractionResponse)
async def extract_claim_data(request: ExtractionRequest):
    """
    Extract structured claim data from unstructured narrative
    """
    start_time = time.time()
    trace_id = f"llm_{hashlib.md5(request.claim_id.encode()).hexdigest()[:12]}"
    
    logger.info(f"[{trace_id}] Starting extraction for claim {request.claim_id}")
    
    try:
        # Build prompt
        system_prompt, user_prompt = build_extraction_prompt(request)
        
        # Call LLM based on provider
        if LLM_PROVIDER == "claude" and claude_client:
            result = call_claude_api(system_prompt, user_prompt)
        elif LLM_PROVIDER == "openai" and openai.api_key:
            result = call_openai_api(system_prompt, user_prompt)
        else:
            raise HTTPException(status_code=503, detail="No LLM provider configured")
        
        extracted_data = result["data"]
        
        # Validate and construct response
        response = ExtractionResponse(
            claim_id=request.claim_id,
            fnol_summary=extracted_data.get("fnol_summary", ""),
            vehicles=[VehicleDetails(**v) for v in extracted_data.get("vehicles", [])],
            location=LocationDetails(**extracted_data.get("location", {})),
            parties=[PartyDetails(**p) for p in extracted_data.get("parties", [])],
            incident_time=extracted_data.get("incident_time"),
            injuries_reported=extracted_data.get("injuries_reported"),
            injury_description=extracted_data.get("injury_description"),
            police_report_filed=extracted_data.get("police_report_filed"),
            police_report_number=extracted_data.get("police_report_number"),
            damage_narrative=extracted_data.get("damage_narrative", ""),
            missing_fields=extracted_data.get("missing_fields", []),
            overall_confidence_score=extracted_data.get("overall_confidence_score", 0.0),
            llm_model_version=result["model_version"],
            processing_time_ms=result["processing_time_ms"],
            evidence_quotes=extracted_data.get("evidence_quotes", [])
        )
        
        total_time = int((time.time() - start_time) * 1000)
        logger.info(f"[{trace_id}] Extraction completed in {total_time}ms, confidence: {response.overall_confidence_score}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{trace_id}] Extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    llm_status = "up" if (claude_client or openai.api_key) else "down"
    
    return {
        "status": "healthy" if llm_status == "up" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "llm_api": llm_status
        },
        "version": "1.0.0",
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL_VERSION
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)