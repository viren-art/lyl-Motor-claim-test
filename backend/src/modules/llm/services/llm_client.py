import json
import time
from typing import Dict, Any, Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import httpx
from openai import OpenAI, APIError, APITimeoutError, RateLimitError
from anthropic import Anthropic, APIError as AnthropicAPIError

from ..config import config
from ..prompts.extraction_prompt import (
    EXTRACTION_SYSTEM_PROMPT,
    EXTRACTION_USER_PROMPT_TEMPLATE,
    EXTRACTION_PROMPT_VERSION
)

class LLMClient:
    """
    LLM client with retry logic, timeout enforcement, and provider abstraction
    """
    
    def __init__(self):
        self.provider = config.provider
        self.model_version = config.model_version
        
        if self.provider == 'openai':
            self.client = OpenAI(
                api_key=config.api_key,
                timeout=config.timeout_seconds,
                max_retries=0  # We handle retries with tenacity
            )
        elif self.provider == 'anthropic':
            self.client = Anthropic(
                api_key=config.api_key,
                timeout=config.timeout_seconds
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((APITimeoutError, RateLimitError, httpx.TimeoutException)),
        reraise=True
    )
    async def extract_claim_data(
        self,
        narrative: str,
        language: str = 'th',
        channel: str = 'web',
        incident_date: Optional[str] = None,
        location: Optional[str] = None,
        police_report_filed: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        Extract structured claim data from unstructured narrative
        
        Args:
            narrative: FNOL narrative text (Thai/English/Tinglish)
            language: Input language ('th', 'en', 'tinglish')
            channel: Submission channel ('chat', 'email', 'web')
            incident_date: Optional pre-filled incident date
            location: Optional pre-filled location
            police_report_filed: Optional pre-filled police report status
        
        Returns:
            Dict containing extracted fields with confidence scores
        
        Raises:
            APITimeoutError: If LLM request exceeds timeout
            APIError: If LLM service returns error
        """
        start_time = time.time()
        
        # Format user prompt with context
        user_prompt = EXTRACTION_USER_PROMPT_TEMPLATE.format(
            language=language,
            channel=channel,
            narrative=narrative,
            incident_date=incident_date or 'Not provided',
            location=location or 'Not provided',
            police_report_filed='Yes' if police_report_filed else 'No' if police_report_filed is False else 'Not provided'
        )
        
        try:
            if self.provider == 'openai':
                response = self.client.chat.completions.create(
                    model=self.model_version,
                    messages=[
                        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=config.temperature,
                    max_tokens=config.max_tokens,
                    response_format={"type": "json_object"}  # Force JSON output
                )
                
                extracted_data = json.loads(response.choices[0].message.content)
                
            elif self.provider == 'anthropic':
                response = self.client.messages.create(
                    model=self.model_version,
                    max_tokens=config.max_tokens,
                    temperature=config.temperature,
                    system=EXTRACTION_SYSTEM_PROMPT,
                    messages=[
                        {"role": "user", "content": user_prompt}
                    ]
                )
                
                # Extract JSON from response (Claude may wrap in markdown)
                content = response.content[0].text
                if '```json' in content:
                    content = content.split('```json')[1].split('```')[0].strip()
                elif '```' in content:
                    content = content.split('```')[1].split('```')[0].strip()
                
                extracted_data = json.loads(content)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            # Add metadata
            extracted_data['_metadata'] = {
                'llm_provider': self.provider,
                'llm_model_version': self.model_version,
                'prompt_version': EXTRACTION_PROMPT_VERSION,
                'processing_time_ms': processing_time_ms,
                'input_language': language,
                'input_channel': channel
            }
            
            return extracted_data
            
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {str(e)}")
        except (APITimeoutError, httpx.TimeoutException) as e:
            processing_time_ms = int((time.time() - start_time) * 1000)
            raise APITimeoutError(
                f"LLM extraction timeout after {processing_time_ms}ms (limit: {config.timeout_seconds}s)"
            )
        except Exception as e:
            processing_time_ms = int((time.time() - start_time) * 1000)
            raise APIError(f"LLM extraction failed after {processing_time_ms}ms: {str(e)}")
    
    def validate_extraction_schema(self, extracted_data: Dict[str, Any]) -> bool:
        """
        Validate extracted data against expected schema
        
        Args:
            extracted_data: Extracted claim data from LLM
        
        Returns:
            True if schema is valid, False otherwise
        """
        required_fields = [
            'vehicles',
            'incident_details',
            'parties',
            'injuries',
            'police_report',
            'overall_confidence',
            'missing_critical_fields',
            'language_detected'
        ]
        
        for field in required_fields:
            if field not in extracted_data:
                return False
        
        # Validate confidence scores are in range [0.0, 1.0]
        if not (0.0 <= extracted_data.get('overall_confidence', -1) <= 1.0):
            return False
        
        # Validate vehicles array
        if not isinstance(extracted_data.get('vehicles', None), list):
            return False
        
        for vehicle in extracted_data['vehicles']:
            if 'vehicle_type' not in vehicle or vehicle['vehicle_type'] not in ['INSURED', 'THIRD_PARTY']:
                return False
            if 'confidence_score' not in vehicle or not (0.0 <= vehicle['confidence_score'] <= 1.0):
                return False
        
        return True