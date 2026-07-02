import requests
import time
import random
from ultralytics import YOLO

# Initialize YOLO model (will download yolov8n.pt if not present)
print("Loading YOLO model...")
model = YOLO('yolov8n.pt')

# API Endpoint
API_URL = "http://localhost:8000/api/log-detection/"
BOAT_ID = 1

# Simulation area (around Riverside Park NYC)
BASE_LAT = 40.7128
BASE_LNG = -74.0060

def simulate_detection_cycle():
    print("Capturing frame from camera...")
    # Run YOLO on a sample image included with ultralytics to simulate processing a frame
    # In a real scenario, this would be a frame from OpenCV: `ret, frame = cap.read()`
    results = model('https://ultralytics.com/images/bus.jpg', verbose=False)
    
    # Count detected objects (in real life, we would filter by class id for 'bottle', 'cup', etc.)
    # For simulation, we'll just count total objects detected in the frame.
    detected_count = len(results[0].boxes)
    print(f"Detected {detected_count} objects in the current frame.")
    
    # Randomize position slightly to simulate boat moving
    lat = BASE_LAT + random.uniform(-0.005, 0.005)
    lng = BASE_LNG + random.uniform(-0.005, 0.005)
    
    payload = {
        "boat_id": BOAT_ID,
        "latitude": lat,
        "longitude": lng,
        "trash_count": detected_count
    }
    
    try:
        response = requests.post(API_URL, json=payload)
        if response.status_code == 201:
            print(f"Successfully logged detection to server: {payload}")
        else:
            print(f"Failed to log detection. Server responded: {response.text}")
    except requests.exceptions.ConnectionError:
        print("Failed to connect to the server. Is Django running on port 8000?")

if __name__ == "__main__":
    print("Starting Aquatic Waste Collection Boat Simulator...")
    # Run a few cycles to simulate data gathering
    for i in range(3):
        print(f"\n--- Cycle {i+1} ---")
        simulate_detection_cycle()
        time.sleep(2)
    print("\nSimulation complete.")
