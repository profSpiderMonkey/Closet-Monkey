#!/usr/bin/env python3
"""
Closet Monkey RFID Reader
Hardware interface for Raspberry Pi RFID tracking
"""

import time
import json
import requests
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/pi/closet-monkey/hardware/logs/rfid.log'),
        logging.StreamHandler()
    ]
)

class RFIDReader:
    def __init__(self, api_url="http://localhost:3001/api"):
        self.api_url = api_url
        self.last_tags = set()
        
    def read_tags(self):
        """
        Read RFID tags - this will need to be implemented
        based on your specific RFID hardware
        """
        # Placeholder - implement actual RFID reading here
        # This would interface with your RFID reader hardware
        return []
    
    def detect_departure_arrival(self, current_tags):
        """
        Determine if this is a departure or arrival event
        """
        if not self.last_tags and current_tags:
            event_type = "departure"
        elif self.last_tags and not current_tags:
            event_type = "arrival"
        elif current_tags != self.last_tags:
            event_type = "departure" if len(current_tags) > len(self.last_tags) else "arrival"
        else:
            return None
            
        return event_type
    
    def send_to_api(self, tags, event_type):
        """
        Send RFID event to the backend API
        """
        try:
            data = {
                "tags": list(tags),
                "event_type": event_type,
                "timestamp": datetime.now().isoformat(),
                "location": "main_door"
            }
            
            response = requests.post(f"{self.api_url}/rfid/event", json=data)
            response.raise_for_status()
            
            logging.info(f"Sent {event_type} event with {len(tags)} tags")
            
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to send API request: {e}")
    
    def run(self):
        """
        Main loop for RFID monitoring
        """
        logging.info("Starting RFID reader...")
        
        while True:
            try:
                current_tags = set(self.read_tags())
                event_type = self.detect_departure_arrival(current_tags)
                
                if event_type:
                    self.send_to_api(current_tags, event_type)
                    self.last_tags = current_tags.copy()
                
                time.sleep(1)  # Check every second
                
            except KeyboardInterrupt:
                logging.info("RFID reader stopped by user")
                break
            except Exception as e:
                logging.error(f"Error in RFID reader: {e}")
                time.sleep(5)  # Wait before retrying

if __name__ == "__main__":
    reader = RFIDReader()
    reader.run()
