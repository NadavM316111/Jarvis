import os
import cv2
import time
import base64
import requests
import numpy as np
from dotenv import load_dotenv

load_dotenv('.env.local')

# Suppress OpenCV warnings entirely
os.environ['OPENCV_LOG_LEVEL'] = 'SILENT'
os.environ['OPENCV_VIDEOIO_DEBUG'] = '0'

JARVIS_SERVER = 'http://localhost:3001'
AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJuYWRhdm1pbmtvd2l0el9nbWFpbF9jb20iLCJlbWFpbCI6Im5hZGF2bWlua293aXR6QGdtYWlsLmNvbSIsIm5hbWUiOiJOYWRhdiIsImlhdCI6MTc3NTY2OTA3NywiZXhwIjoxNzc4MjYxMDc3fQ.02zpXrYe3fD77EV2ww-SKyvlXM4nYp0pMoVila8U0GI'

KNOWN_USERS = {}
KNOWN_USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'known_faces.npy')

last_seen_name = None
last_emotion = None
last_greeting_time = 0
last_emotion_update_time = 0
presence_start_time = None
away_since = None
GREETING_COOLDOWN = 300
EMOTION_UPDATE_INTERVAL = 30
AWAY_THRESHOLD = 60

def load_known_faces():
    global KNOWN_USERS
    if os.path.exists(KNOWN_USERS_FILE):
        try:
            data = np.load(KNOWN_USERS_FILE, allow_pickle=True).item()
            KNOWN_USERS = data
            print(f'[FACE] Loaded {len(KNOWN_USERS)} known face(s): {list(KNOWN_USERS.keys())}')
        except Exception as e:
            print(f'[FACE] Could not load known faces: {e}')

def save_known_faces():
    try:
        np.save(KNOWN_USERS_FILE, KNOWN_USERS)
        print(f'[FACE] Saved known faces')
    except Exception as e:
        print(f'[FACE] Could not save: {e}')

def post_face_status(data):
    try:
        requests.post(f'{JARVIS_SERVER}/face-status', json=data,
            headers={'Authorization': f'Bearer {AUTH_TOKEN}'}, timeout=3)
    except:
        pass

def get_latest_frame():
    """Fetch the latest camera frame from the server instead of opening camera."""
    try:
        res = requests.get(f'{JARVIS_SERVER}/camera-frame-raw',
            headers={'Authorization': f'Bearer {AUTH_TOKEN}'}, timeout=3)
        if res.status_code == 200:
            data = res.json()
            frame_b64 = data.get('frame')
            if frame_b64:
                img_bytes = base64.b64decode(frame_b64)
                arr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                return frame
    except:
        pass
    return None

def recognize_face(frame_rgb, face_location):
    try:
        import face_recognition
        encoding = face_recognition.face_encodings(frame_rgb, [face_location])
        if not encoding:
            return 'Unknown'
        encoding = encoding[0]
        for name, known_enc in KNOWN_USERS.items():
            results = face_recognition.compare_faces([known_enc], encoding, tolerance=0.5)
            if results[0]:
                return name
        return 'Unknown'
    except Exception as e:
        return 'Unknown'

def detect_emotion(frame_bgr, face_location):
    try:
        from deepface import DeepFace
        top, right, bottom, left = face_location
        face_crop = frame_bgr[top:bottom, left:right]
        if face_crop.size == 0:
            return None
        result = DeepFace.analyze(face_crop, actions=['emotion'], enforce_detection=False, silent=True)
        if isinstance(result, list):
            result = result[0]
        return result.get('dominant_emotion', None)
    except:
        return None

def enroll_face(name, frame_rgb, face_location):
    try:
        import face_recognition
        encoding = face_recognition.face_encodings(frame_rgb, [face_location])
        if encoding:
            KNOWN_USERS[name] = encoding[0]
            save_known_faces()
            print(f'[FACE] Enrolled: {name}')
            return True
    except Exception as e:
        print(f'[FACE] Enroll error: {e}')
    return False

def emotion_to_tone(emotion):
    return {
        'happy':    'upbeat and enthusiastic',
        'sad':      'gentle and supportive',
        'angry':    'calm and measured',
        'fear':     'calm and reassuring',
        'disgust':  'neutral and professional',
        'surprise': 'engaged and curious',
        'neutral':  'normal',
    }.get(emotion, 'normal')

def main():
    global last_seen_name, last_emotion, last_greeting_time
    global last_emotion_update_time, presence_start_time, away_since

    load_known_faces()
    auto_enroll_pending = len(KNOWN_USERS) == 0

    print('[FACE] Face monitor running — using server camera feed.')
    if auto_enroll_pending:
        print('[FACE] No known faces — will auto-enroll first detected face as Nadav.')

    no_face_streak = 0

    while True:
        time.sleep(3)  # Analyze every 3 seconds

        frame_bgr = get_latest_frame()
        if frame_bgr is None:
            continue

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        try:
            import face_recognition
            small = cv2.resize(frame_rgb, (0, 0), fx=0.5, fy=0.5)
            locations = face_recognition.face_locations(small, model='hog')
            locations = [(t*2, r*2, b*2, l*2) for (t, r, b, l) in locations]
        except Exception as e:
            print(f'[FACE] Detection error: {e}')
            continue

        now = time.time()

        if not locations:
            no_face_streak += 1
            if no_face_streak >= 5 and last_seen_name and away_since is None:
                away_since = now
            if away_since and (now - away_since) > AWAY_THRESHOLD:
                if last_seen_name:
                    print(f'[FACE] {last_seen_name} has left')
                    post_face_status({'present': False, 'name': None, 'emotion': None, 'event': 'left', 'person': last_seen_name})
                    last_seen_name = None
                    last_emotion = None
                    presence_start_time = None
                    away_since = None
            continue

        no_face_streak = 0
        away_since = None
        face_location = locations[0]

        if auto_enroll_pending:
            success = enroll_face('Nadav', frame_rgb, face_location)
            if success:
                auto_enroll_pending = False
                print('[FACE] Auto-enrolled Nadav.')

        name = recognize_face(frame_rgb, face_location)
        emotion = detect_emotion(frame_bgr, face_location)

        if name != 'Unknown':
            if last_seen_name != name:
                last_seen_name = name
                presence_start_time = now
                if (now - last_greeting_time) > GREETING_COOLDOWN:
                    last_greeting_time = now
                    hour = time.localtime().tm_hour
                    greeting = f'Good {"morning" if hour < 12 else "afternoon" if hour < 17 else "evening"}, {name}.'
                    print(f'[FACE] Greeting: {greeting}')
                    post_face_status({'present': True, 'name': name, 'emotion': emotion,
                        'event': 'greeting', 'greeting': greeting,
                        'tone': emotion_to_tone(emotion) if emotion else 'normal'})

            if emotion and emotion != last_emotion:
                if (now - last_emotion_update_time) > EMOTION_UPDATE_INTERVAL:
                    last_emotion = emotion
                    last_emotion_update_time = now
                    tone = emotion_to_tone(emotion)
                    print(f'[FACE] Emotion: {emotion}')
                    post_face_status({'present': True, 'name': name, 'emotion': emotion,
                        'event': 'emotion_change', 'tone': tone})
        else:
            if last_seen_name != 'Unknown':
                last_seen_name = 'Unknown'
                print('[FACE] Unknown person detected')
                post_face_status({'present': True, 'name': 'Unknown', 'emotion': emotion, 'event': 'unknown_person'})

if __name__ == '__main__':
    import subprocess, sys
    for pkg, imp in [('deepface', 'deepface'), ('opencv-python', 'cv2')]:
        try:
            __import__(imp)
        except ImportError:
            print(f'[FACE] Installing {pkg}...')
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', pkg, '-q'])
    main()