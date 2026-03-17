"""
Thai text normalization utilities for consistent LLM processing
"""
import re

class ThaiNormalizer:
    """
    Normalize Thai text for consistent LLM extraction
    """
    
    # Common Thai abbreviations and their full forms
    ABBREVIATIONS = {
        'ร.': 'รถ',
        'ทะเบียน': 'ทะเบียนรถ',
        'จ.': 'จังหวัด',
        'อ.': 'อำเภอ',
        'ต.': 'ตำบล',
        'ถ.': 'ถนน',
        'ซ.': 'ซอย',
        'ม.': 'หมู่',
        'บ.': 'บริษัท',
        'ผ.': 'ผู้',
    }
    
    # Thai vehicle type mappings
    VEHICLE_TYPES = {
        'กระบะ': 'pickup truck',
        'รถกระบะ': 'pickup truck',
        'เก๋ง': 'sedan',
        'รถเก๋ง': 'sedan',
        'รถตู้': 'van',
        'รถบรรทุก': 'truck',
        'มอเตอร์ไซค์': 'motorcycle',
        'มอไซค์': 'motorcycle',
        'รถจักรยานยนต์': 'motorcycle',
        'รถยนต์': 'car',
        'รถ': 'vehicle',
    }
    
    # Thai color mappings
    COLORS = {
        'ขาว': 'white',
        'ดำ': 'black',
        'แดง': 'red',
        'น้ำเงิน': 'blue',
        'เทา': 'gray',
        'เงิน': 'silver',
        'ทอง': 'gold',
        'เขียว': 'green',
        'ส้ม': 'orange',
        'ชมพู': 'pink',
    }
    
    @classmethod
    def normalize_text(cls, text: str) -> str:
        """
        Normalize Thai text for LLM processing
        
        Args:
            text: Raw Thai text
        
        Returns:
            Normalized text
        """
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Normalize Thai numerals to Arabic numerals
        text = cls.normalize_thai_numerals(text)
        
        # Expand common abbreviations
        for abbr, full in cls.ABBREVIATIONS.items():
            text = text.replace(abbr, full)
        
        return text
    
    @classmethod
    def normalize_thai_numerals(cls, text: str) -> str:
        """
        Convert Thai numerals (๐-๙) to Arabic numerals (0-9)
        
        Args:
            text: Text containing Thai numerals
        
        Returns:
            Text with Arabic numerals
        """
        thai_to_arabic = {
            '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
            '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
        }
        
        for thai, arabic in thai_to_arabic.items():
            text = text.replace(thai, arabic)
        
        return text
    
    @classmethod
    def extract_license_plate(cls, text: str) -> str:
        """
        Extract Thai license plate from text
        
        Thai license plate formats:
        - Old format: กข-1234 (2 Thai chars + 4 digits)
        - New format: 1กข-1234 (1 digit + 2 Thai chars + 4 digits)
        
        Args:
            text: Text containing license plate
        
        Returns:
            Extracted license plate or 'unknown'
        """
        # Old format: 2 Thai chars + dash + 4 digits
        old_format = re.search(r'[\u0E00-\u0E7F]{2}-?\d{4}', text)
        if old_format:
            return old_format.group(0)
        
        # New format: 1 digit + 2 Thai chars + dash + 4 digits
        new_format = re.search(r'\d[\u0E00-\u0E7F]{2}-?\d{4}', text)
        if new_format:
            return new_format.group(0)
        
        return 'unknown'
    
    @classmethod
    def extract_phone_number(cls, text: str) -> str:
        """
        Extract Thai phone number from text
        
        Thai phone formats:
        - Mobile: 08x-xxx-xxxx, 09x-xxx-xxxx, 06x-xxx-xxxx
        - Landline: 0x-xxx-xxxx
        
        Args:
            text: Text containing phone number
        
        Returns:
            Extracted phone number or 'unknown'
        """
        # Mobile format (10 digits starting with 06, 08, 09)
        mobile = re.search(r'0[689]\d{1}-?\d{3}-?\d{4}', text)
        if mobile:
            return mobile.group(0)
        
        # Landline format (9 digits starting with 0)
        landline = re.search(r'0\d{1}-?\d{3}-?\d{4}', text)
        if landline:
            return landline.group(0)
        
        return 'unknown'
    
    @classmethod
    def translate_vehicle_type(cls, thai_vehicle: str) -> str:
        """
        Translate Thai vehicle type to English
        
        Args:
            thai_vehicle: Thai vehicle type
        
        Returns:
            English vehicle type or original if not found
        """
        thai_vehicle_lower = thai_vehicle.lower()
        for thai, english in cls.VEHICLE_TYPES.items():
            if thai in thai_vehicle_lower:
                return english
        return thai_vehicle
    
    @classmethod
    def translate_color(cls, thai_color: str) -> str:
        """
        Translate Thai color to English
        
        Args:
            thai_color: Thai color name
        
        Returns:
            English color name or original if not found
        """
        return cls.COLORS.get(thai_color, thai_color)