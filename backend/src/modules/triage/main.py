"""
Triage Decision Engine with LLM-Powered Routing and Fraud Scoring
Implements three-path routing: Straight-through, Adjuster Review, Fraud Review
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
import os
import asyncio
import logging
from uuid import uuid4
import json

# LLM client imports
import anthropic
import openai

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Roojai Triage Service", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude")  # claude or openai
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "10"))
CONFIDENCE_THRESHOLD_LOW = float(os.getenv("CONFIDENCE_THRESHOLD_LOW", "0.75"))
HIGH_VALUE_THRESHOLD_THB = float(os.getenv("HIGH_VALUE_THRESHOLD_THB", "500000"))
FRAUD_RISK_THRESHOLD = float(os.getenv("FRAUD_RISK_THRESHOLD", "70"))

# Initialize LLM clients
claude_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


# Request/Response Models
class Vehicle(BaseModel):
    role: Literal["INSURED", "THIRD_PARTY"]
    license_plate: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    damage_description: Optional[str] = None


class IncidentDetails(BaseModel):
    date: str
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    address: Optional[str] = None
    narrative: str
    injuries_reported: bool
    police_report_filed: bool
    police_report_number: Optional[str] = None


class CoverageCheck(BaseModel):
    policy_active: bool
    deductible_amount_thb: float
    exclusions_apply: List[str]
    required_documents: List[str]


class LLMOutputs(BaseModel):
    fnol_summary: str
    missing_fields: List[str]
    confidence_score: float
    llm_model_version: str


class TriageRequest(BaseModel):
    claim_id: str
    policy_number: str
    language: Literal["th", "en"]
    incident_details: IncidentDetails
    vehicles: List[Vehicle]
    llm_outputs: LLMOutputs
    coverage_check: CoverageCheck
    estimated_claim_value_thb: Optional[float] = None

    @validator('estimated_claim_value_thb')
    def validate_claim_value(cls, v):
        if v is not None and v < 0:
            raise ValueError("Claim value cannot be negative")
        return v


class EvidenceQuote(BaseModel):
    text: str
    source: Literal["narrative", "extraction", "coverage"]
    relevance: str


class TriageResponse(BaseModel):
    claim_id: str
    route: Literal["STRAIGHT_THROUGH", "ADJUSTER_REVIEW", "FRAUD_REVIEW"]
    rationale: str
    evidence_quotes: List[EvidenceQuote]
    fraud_risk_score: float = Field(ge=0, le=100)
    confidence_score: float = Field(ge=0, le=1)
    human_review_required: bool
    processing_time_ms: int
    llm_model_version: str
    decision_factors: Dict[str, Any]


# Thai Motor Fraud Pattern Library
THAI_FRAUD_PATTERNS = {
    "staged_accident": {
        "keywords_th": ["จงใจ", "แอบ", "ตั้งใจ", "วางแผน", "นัดหมาย"],
        "keywords_en": ["staged", "planned", "arranged", "intentional"],
        "risk_weight": 35,
        "description": "Indicators of pre-arranged collision"
    },
    "phantom_injury": {
        "keywords_th": ["ไม่มีบาดแผล", "ไม่เจ็บ", "แต่งเรื่อง", "อ้างว่า"],
        "keywords_en": ["no visible injury", "claims pain", "exaggerated", "phantom"],
        "risk_weight": 25,
        "description": "Claimed injuries without physical evidence"
    },
    "geographic_hotspot": {
        "high_risk_provinces": ["สมุทรปราการ", "ชลบุรี", "ระยอง", "นนทบุรี"],
        "high_risk_districts": ["บางพลี", "ศรีราชา", "เมือง"],
        "risk_weight": 15,
        "description": "Incident in known fraud hotspot area"
    },
    "suspicious_timing": {
        "indicators": ["late_night", "early_morning", "remote_location"],
        "risk_weight": 10,
        "description": "Unusual time or location for incident"
    },
    "multiple_claims_pattern": {
        "indicators": ["frequent_claimant", "same_vehicle_multiple", "same_location_multiple"],
        "risk_weight": 20,
        "description": "Pattern of repeated claims"
    },
    "inflated_damages": {
        "keywords_th": ["ทั้งคัน", "เสียหมด", "ซ่อมใหม่ทั้งหมด"],
        "keywords_en": ["total loss", "complete damage", "entire vehicle"],
        "risk_weight": 15,
        "description": "Damage description inconsistent with incident severity"
    },
    "third_party_collusion": {
        "keywords_th": ["รู้จัก", "เพื่อน", "คนรู้จัก", "ญาติ"],
        "keywords_en": ["acquaintance", "friend", "relative", "known"],
        "risk_weight": 25,
        "description": "Relationship between parties suggests collusion"
    }
}


async def calculate_fraud_risk_score(
    incident_details: IncidentDetails,
    vehicles: List[Vehicle],
    llm_outputs: LLMOutputs,
    coverage_check: CoverageCheck
) -> tuple[float, List[Dict[str, Any]]]:
    """
    Calculate fraud risk score based on Thai motor fraud patterns
    Returns: (risk_score, detected_indicators)
    """
    detected_indicators = []
    total_risk = 0.0
    
    narrative_lower = incident_details.narrative.lower()
    
    # Check staged accident patterns
    staged_matches = 0
    for keyword in THAI_FRAUD_PATTERNS["staged_accident"]["keywords_th"]:
        if keyword in incident_details.narrative:
            staged_matches += 1
    for keyword in THAI_FRAUD_PATTERNS["staged_accident"]["keywords_en"]:
        if keyword in narrative_lower:
            staged_matches += 1
    
    if staged_matches >= 2:
        indicator = {
            "type": "staged_accident",
            "description": THAI_FRAUD_PATTERNS["staged_accident"]["description"],
            "evidence": f"Found {staged_matches} suspicious keywords in narrative",
            "risk_contribution": THAI_FRAUD_PATTERNS["staged_accident"]["risk_weight"]
        }
        detected_indicators.append(indicator)
        total_risk += THAI_FRAUD_PATTERNS["staged_accident"]["risk_weight"]
    
    # Check phantom injury patterns
    if incident_details.injuries_reported:
        phantom_matches = 0
        for keyword in THAI_FRAUD_PATTERNS["phantom_injury"]["keywords_th"]:
            if keyword in incident_details.narrative:
                phantom_matches += 1
        for keyword in THAI_FRAUD_PATTERNS["phantom_injury"]["keywords_en"]:
            if keyword in narrative_lower:
                phantom_matches += 1
        
        if phantom_matches >= 1:
            indicator = {
                "type": "phantom_injury",
                "description": THAI_FRAUD_PATTERNS["phantom_injury"]["description"],
                "evidence": f"Injury claimed with suspicious language patterns",
                "risk_contribution": THAI_FRAUD_PATTERNS["phantom_injury"]["risk_weight"]
            }
            detected_indicators.append(indicator)
            total_risk += THAI_FRAUD_PATTERNS["phantom_injury"]["risk_weight"]
    
    # Check geographic hotspots
    if incident_details.address:
        address_lower = incident_details.address.lower()
        for province in THAI_FRAUD_PATTERNS["geographic_hotspot"]["high_risk_provinces"]:
            if province in incident_details.address:
                indicator = {
                    "type": "geographic_hotspot",
                    "description": THAI_FRAUD_PATTERNS["geographic_hotspot"]["description"],
                    "evidence": f"Incident in high-risk province: {province}",
                    "risk_contribution": THAI_FRAUD_PATTERNS["geographic_hotspot"]["risk_weight"]
                }
                detected_indicators.append(indicator)
                total_risk += THAI_FRAUD_PATTERNS["geographic_hotspot"]["risk_weight"]
                break
    
    # Check suspicious timing (late night 22:00-05:00)
    try:
        incident_time = datetime.fromisoformat(incident_details.date.replace('Z', '+00:00'))
        hour = incident_time.hour
        if hour >= 22 or hour <= 5:
            indicator = {
                "type": "suspicious_timing",
                "description": THAI_FRAUD_PATTERNS["suspicious_timing"]["description"],
                "evidence": f"Incident occurred at {hour:02d}:00 (late night/early morning)",
                "risk_contribution": THAI_FRAUD_PATTERNS["suspicious_timing"]["risk_weight"]
            }
            detected_indicators.append(indicator)
            total_risk += THAI_FRAUD_PATTERNS["suspicious_timing"]["risk_weight"]
    except Exception as e:
        logger.warning(f"Could not parse incident date for timing analysis: {e}")
    
    # Check inflated damages
    inflated_matches = 0
    for keyword in THAI_FRAUD_PATTERNS["inflated_damages"]["keywords_th"]:
        if keyword in incident_details.narrative:
            inflated_matches += 1
    for keyword in THAI_FRAUD_PATTERNS["inflated_damages"]["keywords_en"]:
        if keyword in narrative_lower:
            inflated_matches += 1
    
    if inflated_matches >= 1:
        for vehicle in vehicles:
            if vehicle.damage_description and len(vehicle.damage_description) > 200:
                indicator = {
                    "type": "inflated_damages",
                    "description": THAI_FRAUD_PATTERNS["inflated_damages"]["description"],
                    "evidence": "Extensive damage claims with suspicious language",
                    "risk_contribution": THAI_FRAUD_PATTERNS["inflated_damages"]["risk_weight"]
                }
                detected_indicators.append(indicator)
                total_risk += THAI_FRAUD_PATTERNS["inflated_damages"]["risk_weight"]
                break
    
    # Check third-party collusion
    if len(vehicles) > 1:
        collusion_matches = 0
        for keyword in THAI_FRAUD_PATTERNS["third_party_collusion"]["keywords_th"]:
            if keyword in incident_details.narrative:
                collusion_matches += 1
        for keyword in THAI_FRAUD_PATTERNS["third_party_collusion"]["keywords_en"]:
            if keyword in narrative_lower:
                collusion_matches += 1
        
        if collusion_matches >= 1:
            indicator = {
                "type": "third_party_collusion",
                "description": THAI_FRAUD_PATTERNS["third_party_collusion"]["description"],
                "evidence": "Language suggests relationship between parties",
                "risk_contribution": THAI_FRAUD_PATTERNS["third_party_collusion"]["risk_weight"]
            }
            detected_indicators.append(indicator)
            total_risk += THAI_FRAUD_PATTERNS["third_party_collusion"]["risk_weight"]
    
    # Cap at 100
    risk_score = min(total_risk, 100.0)
    
    return risk_score, detected_indicators


async def call_llm_for_triage(
    claim_data: TriageRequest,
    fraud_indicators: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Call LLM to generate triage decision with rationale and evidence quotes
    """
    
    # Build prompt
    prompt = f"""You are an expert Thai motor insurance claims adjuster. Analyze this claim and provide a triage routing decision.

CLAIM DETAILS:
Policy Number: {claim_data.policy_number}
Language: {claim_data.language}

INCIDENT:
Date: {claim_data.incident_details.date}
Location: {claim_data.incident_details.address or 'GPS: ' + str(claim_data.incident_details.location_lat) + ',' + str(claim_data.incident_details.location_lng)}
Narrative: {claim_data.incident_details.narrative}
Injuries Reported: {claim_data.incident_details.injuries_reported}
Police Report Filed: {claim_data.incident_details.police_report_filed}

VEHICLES:
{json.dumps([v.dict() for v in claim_data.vehicles], indent=2, ensure_ascii=False)}

EXTRACTION RESULTS:
Summary: {claim_data.llm_outputs.fnol_summary}
Missing Fields: {', '.join(claim_data.llm_outputs.missing_fields) if claim_data.llm_outputs.missing_fields else 'None'}
Extraction Confidence: {claim_data.llm_outputs.confidence_score}

COVERAGE:
Policy Active: {claim_data.coverage_check.policy_active}
Deductible: ฿{claim_data.coverage_check.deductible_amount_thb:,.2f}
Exclusions: {', '.join(claim_data.coverage_check.exclusions_apply) if claim_data.coverage_check.exclusions_apply else 'None'}
Required Documents: {', '.join(claim_data.coverage_check.required_documents)}

FRAUD INDICATORS DETECTED:
{json.dumps(fraud_indicators, indent=2, ensure_ascii=False) if fraud_indicators else 'None detected'}

ESTIMATED CLAIM VALUE: ฿{claim_data.estimated_claim_value_thb:,.2f if claim_data.estimated_claim_value_thb else 'Unknown'}

ROUTING OPTIONS:
1. STRAIGHT_THROUGH - Simple claim, clear liability, all documents present, low fraud risk
2. ADJUSTER_REVIEW - Missing information, moderate complexity, or medium fraud risk
3. FRAUD_REVIEW - High fraud risk indicators, suspicious patterns, or requires investigation

INSTRUCTIONS:
1. Analyze all factors: extraction confidence, missing fields, coverage exclusions, fraud indicators, claim value
2. Select exactly ONE routing path
3. Provide a clear rationale (2-3 sentences in {'Thai' if claim_data.language == 'th' else 'English'})
4. Extract at least 2 direct quotes from the incident narrative as evidence
5. Assign a confidence score (0.0-1.0) for your routing decision

Respond in JSON format:
{{
  "route": "STRAIGHT_THROUGH|ADJUSTER_REVIEW|FRAUD_REVIEW",
  "rationale": "explanation in {'Thai' if claim_data.language == 'th' else 'English'}",
  "evidence_quotes": [
    {{"text": "quote from narrative", "relevance": "why this quote matters"}},
    {{"text": "another quote", "relevance": "significance"}}
  ],
  "confidence": 0.85,
  "key_factors": ["factor1", "factor2", "factor3"]
}}"""

    try:
        if LLM_PROVIDER == "claude" and claude_client:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    claude_client.messages.create,
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=2000,
                    temperature=0.3,
                    messages=[{"role": "user", "content": prompt}]
                ),
                timeout=LLM_TIMEOUT_SECONDS
            )
            
            content = response.content[0].text
            model_version = "claude-3-5-sonnet-20241022"
            
        elif LLM_PROVIDER == "openai" and openai_client:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    openai_client.chat.completions.create,
                    model="gpt-4-turbo-preview",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=2000,
                    response_format={"type": "json_object"}
                ),
                timeout=LLM_TIMEOUT_SECONDS
            )
            
            content = response.choices[0].message.content
            model_version = "gpt-4-turbo-preview"
        else:
            raise ValueError("No LLM provider configured")
        
        # Parse JSON response
        result = json.loads(content)
        result["llm_model_version"] = model_version
        
        return result
        
    except asyncio.TimeoutError:
        logger.error(f"LLM timeout after {LLM_TIMEOUT_SECONDS}s for claim {claim_data.claim_id}")
        raise HTTPException(
            status_code=504,
            detail=f"LLM service timeout after {LLM_TIMEOUT_SECONDS} seconds"
        )
    except Exception as e:
        logger.error(f"LLM call failed for claim {claim_data.claim_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"LLM service error: {str(e)}"
        )


def apply_business_rules(
    llm_decision: Dict[str, Any],
    claim_data: TriageRequest,
    fraud_risk_score: float
) -> tuple[str, bool, Dict[str, Any]]:
    """
    Apply business rules to override or validate LLM decision
    Returns: (final_route, human_review_required, decision_factors)
    """
    decision_factors = {
        "llm_route": llm_decision["route"],
        "llm_confidence": llm_decision["confidence"],
        "fraud_risk_score": fraud_risk_score,
        "extraction_confidence": claim_data.llm_outputs.confidence_score,
        "missing_fields_count": len(claim_data.llm_outputs.missing_fields),
        "exclusions_count": len(claim_data.coverage_check.exclusions_apply),
        "claim_value_thb": claim_data.estimated_claim_value_thb,
        "overrides_applied": []
    }
    
    final_route = llm_decision["route"]
    human_review_required = False
    
    # Rule 1: High-value claims force human review
    if claim_data.estimated_claim_value_thb and claim_data.estimated_claim_value_thb > HIGH_VALUE_THRESHOLD_THB:
        if final_route == "STRAIGHT_THROUGH":
            final_route = "ADJUSTER_REVIEW"
            decision_factors["overrides_applied"].append(
                f"High value claim (฿{claim_data.estimated_claim_value_thb:,.0f}) requires human review"
            )
        human_review_required = True
    
    # Rule 2: Low LLM confidence escalates to adjuster
    if llm_decision["confidence"] < CONFIDENCE_THRESHOLD_LOW:
        if final_route == "STRAIGHT_THROUGH":
            final_route = "ADJUSTER_REVIEW"
            decision_factors["overrides_applied"].append(
                f"Low LLM confidence ({llm_decision['confidence']:.2f}) requires human review"
            )
        human_review_required = True
    
    # Rule 3: Low extraction confidence escalates
    if claim_data.llm_outputs.confidence_score < CONFIDENCE_THRESHOLD_LOW:
        if final_route == "STRAIGHT_THROUGH":
            final_route = "ADJUSTER_REVIEW"
            decision_factors["overrides_applied"].append(
                f"Low extraction confidence ({claim_data.llm_outputs.confidence_score:.2f}) requires verification"
            )
        human_review_required = True
    
    # Rule 4: High fraud risk routes to fraud review
    if fraud_risk_score >= FRAUD_RISK_THRESHOLD:
        final_route = "FRAUD_REVIEW"
        decision_factors["overrides_applied"].append(
            f"High fraud risk score ({fraud_risk_score:.1f}) requires investigation"
        )
        human_review_required = True
    
    # Rule 5: Missing critical fields block straight-through
    critical_fields = ["policy_number", "vin", "incident_location"]
    missing_critical = [f for f in claim_data.llm_outputs.missing_fields if any(cf in f.lower() for cf in critical_fields)]
    
    if missing_critical and final_route == "STRAIGHT_THROUGH":
        final_route = "ADJUSTER_REVIEW"
        decision_factors["overrides_applied"].append(
            f"Missing critical fields: {', '.join(missing_critical)}"
        )
        human_review_required = True
    
    # Rule 6: Coverage exclusions require review
    if claim_data.coverage_check.exclusions_apply and final_route == "STRAIGHT_THROUGH":
        final_route = "ADJUSTER_REVIEW"
        decision_factors["overrides_applied"].append(
            f"Coverage exclusions detected: {', '.join(claim_data.coverage_check.exclusions_apply[:2])}"
        )
        human_review_required = True
    
    # Rule 7: Inactive policy blocks auto-routing
    if not claim_data.coverage_check.policy_active:
        final_route = "ADJUSTER_REVIEW"
        decision_factors["overrides_applied"].append("Policy not active - requires verification")
        human_review_required = True
    
    return final_route, human_review_required, decision_factors


@app.post("/api/v1/triage/route", response_model=TriageResponse)
async def execute_triage(request: TriageRequest):
    """
    Execute triage routing decision for a claim
    """
    start_time = datetime.now()
    trace_id = f"tri_{uuid4().hex[:12]}"
    
    logger.info(f"[{trace_id}] Starting triage for claim {request.claim_id}")
    
    try:
        # Step 1: Calculate fraud risk score
        fraud_risk_score, fraud_indicators = await calculate_fraud_risk_score(
            request.incident_details,
            request.vehicles,
            request.llm_outputs,
            request.coverage_check
        )
        
        logger.info(f"[{trace_id}] Fraud risk score: {fraud_risk_score:.1f}, indicators: {len(fraud_indicators)}")
        
        # Step 2: Call LLM for triage decision
        llm_decision = await call_llm_for_triage(request, fraud_indicators)
        
        logger.info(f"[{trace_id}] LLM decision: {llm_decision['route']}, confidence: {llm_decision['confidence']:.2f}")
        
        # Step 3: Apply business rules
        final_route, human_review_required, decision_factors = apply_business_rules(
            llm_decision,
            request,
            fraud_risk_score
        )
        
        logger.info(f"[{trace_id}] Final route: {final_route}, human review: {human_review_required}")
        
        # Step 4: Build evidence quotes
        evidence_quotes = []
        for quote_data in llm_decision.get("evidence_quotes", [])[:3]:  # Max 3 quotes
            evidence_quotes.append(EvidenceQuote(
                text=quote_data["text"],
                source="narrative",
                relevance=quote_data["relevance"]
            ))
        
        # Add coverage evidence if exclusions exist
        if request.coverage_check.exclusions_apply:
            evidence_quotes.append(EvidenceQuote(
                text=f"Coverage exclusions: {', '.join(request.coverage_check.exclusions_apply[:2])}",
                source="coverage",
                relevance="Policy limitations affecting claim eligibility"
            ))
        
        # Add fraud evidence if high risk
        if fraud_risk_score >= 50:
            top_indicator = max(fraud_indicators, key=lambda x: x["risk_contribution"]) if fraud_indicators else None
            if top_indicator:
                evidence_quotes.append(EvidenceQuote(
                    text=top_indicator["evidence"],
                    source="extraction",
                    relevance=top_indicator["description"]
                ))
        
        # Ensure minimum 2 evidence quotes
        if len(evidence_quotes) < 2:
            evidence_quotes.append(EvidenceQuote(
                text=request.llm_outputs.fnol_summary[:200],
                source="extraction",
                relevance="Claim summary from automated extraction"
            ))
        
        # Step 5: Build rationale
        rationale_parts = [llm_decision["rationale"]]
        if decision_factors["overrides_applied"]:
            rationale_parts.append(
                f"Business rules applied: {'; '.join(decision_factors['overrides_applied'][:2])}"
            )
        
        rationale = " ".join(rationale_parts)
        
        # Calculate processing time
        processing_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Build response
        response = TriageResponse(
            claim_id=request.claim_id,
            route=final_route,
            rationale=rationale,
            evidence_quotes=evidence_quotes,
            fraud_risk_score=fraud_risk_score,
            confidence_score=llm_decision["confidence"],
            human_review_required=human_review_required,
            processing_time_ms=processing_time_ms,
            llm_model_version=llm_decision["llm_model_version"],
            decision_factors=decision_factors
        )
        
        logger.info(f"[{trace_id}] Triage completed in {processing_time_ms}ms")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{trace_id}] Triage failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Triage processing failed: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    llm_status = "up" if (claude_client or openai_client) else "down"
    
    return {
        "status": "healthy" if llm_status == "up" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "llm_api": llm_status,
            "provider": LLM_PROVIDER
        },
        "version": "1.0.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)