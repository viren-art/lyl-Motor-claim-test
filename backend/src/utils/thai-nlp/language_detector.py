"""
Thai language detection and Tinglish identification utilities
"""
import re
from typing import Literal

class LanguageDetector:
    """
    Detect language (Thai, English, Tinglish) from input text
    """
    
    # Thai Unicode range: \u0E00-\u0E7F
    THAI_PATTERN = re.compile(r'[\u0E00-\u0E7F]+')
    
    # English alphabet pattern
    ENGLISH_PATTERN = re.compile(r'[a-zA-Z]+')
    
    # Common Tinglish patterns (Thai + English mixed)
    TINGLISH_INDICATORS = [
        r'[\u0E00-\u0E7F]+\s+[a-zA-Z]+',  # Thai word followed by English
        r'[a-zA-Z]+\s+[\u0E00-\u0E7F]+',  # English word followed by Thai
        r'[\u0E00-\u0E7F]+[a-zA-Z]+',     # Thai and English without space
    ]
    
    @classmethod
    def detect_language(cls, text: str) -> Literal['th', 'en', 'tinglish']:
        """
        Detect primary language of input text
        
        Args:
            text: Input text to analyze
        
        Returns:
            'th' for Thai, 'en' for English, 'tinglish' for mixed
        """
        if not text or len(text.strip()) == 0:
            return 'th'  # Default to Thai
        
        # Count Thai and English characters
        thai_chars = len(cls.THAI_PATTERN.findall(text))
        english_chars = len(cls.ENGLISH_PATTERN.findall(text))
        
        # Check for Tinglish patterns
        for pattern in cls.TINGLISH_INDICATORS:
            if re.search(pattern, text):
                return 'tinglish'
        
        # If both Thai and English present in significant amounts
        if thai_chars > 0 and english_chars > 0:
            if thai_chars > english_chars * 0.3:  # At least 30% Thai relative to English
                return 'tinglish'
        
        # Determine primary language
        if thai_chars > english_chars:
            return 'th'
        elif english_chars > 0:
            return 'en'
        else:
            return 'th'  # Default to Thai
    
    @classmethod
    def normalize_thai_text(cls, text: str) -> str:
        """
        Normalize Thai text (remove extra spaces, normalize quotes)
        
        Args:
            text: Thai text to normalize
        
        Returns:
            Normalized text
        """
        # Remove multiple spaces
        text = re.sub(r'\s+', ' ', text)
        
        # Normalize Thai quotes
        text = text.replace('"', '"').replace('"', '"')
        text = text.replace(''', "'").replace(''', "'")
        
        # Remove leading/trailing whitespace
        text = text.strip()
        
        return text
    
    @classmethod
    def extract_thai_segments(cls, text: str) -> list:
        """
        Extract Thai language segments from mixed text
        
        Args:
            text: Mixed language text
        
        Returns:
            List of Thai text segments
        """
        return cls.THAI_PATTERN.findall(text)
    
    @classmethod
    def extract_english_segments(cls, text: str) -> list:
        """
        Extract English segments from mixed text
        
        Args:
            text: Mixed language text
        
        Returns:
            List of English text segments
        """
        return cls.ENGLISH_PATTERN.findall(text)