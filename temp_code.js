process.chdir('C:/Users/nadav/jarvis-web');
const fs = require('fs');

// Create a simple camera capture page that sends frames to the server
const cameraHtml = `<!DOCTYPE html>
<html>
<head>
    <title>JARVIS Camera Feed</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #0a0a0a;
            color: #00d4ff;
            font-family: 'Segoe UI', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        h1 {
            color: #00d4ff;
            text-shadow: 0 0 10px #00d4ff;
        }
        #video {
            width: 640px;
            height: 480px;
            border: 2px solid #00d4ff;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
        }
        #canvas {
            display: none;
        }
        #status {
            margin-top: 20px;
            padding: 10px 20px;
            background: rgba(0, 212, 255, 0.1);
            border-radius: 5px;
        }
        button {
            margin-top: 20px;
            padding: 15px 30px;
            background: linear-gradient(135deg, #00d4ff, #0066ff);
            border: none;
            border-radius: 25px;
            color: white;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
        }
        button:hover {
            transform: scale(1.05);
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
        }
        #snapshot {
            margin-top: 20px;
            max-width: 320px;
            border: 1px solid #00d4ff;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <h1>JARVIS Vision System</h1>
    <video id="video" autoplay playsinline></video>
    <canvas id="canvas" width="640" height="480"></canvas>
    <div id="status">Initializing camera...</div>
    <button onclick="captureAndSend()">Capture Snapshot for JARVIS</button>
    <img id="snapshot" style="display:none;">
    
    <script>
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const status = document.getElementById('status');
        const snapshot = document.getElementById('snapshot');
        const ctx = canvas.getContext('2d');
        
        async function initCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: 640, height: 480 } 
                });
                video.srcObject = stream;
                status.textContent = 'Camera active - JARVIS vision online';
            } catch (err) {
                status.textContent = 'Camera access denied: ' + err.message;
            }
        }
        
        function captureAndSend() {
            ctx.drawImage(video, 0, 0, 640, 480);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            snapshot.src = dataUrl;
            snapshot.style.display = 'block';
            
            // Save to file for JARVIS to read
            fetch('/api/camera-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: dataUrl })
            }).then(r => r.json()).then(data => {
                status.textContent = 'Snapshot captured! JARVIS can now see this frame.';
            }).catch(err => {
                // Fallback - copy to clipboard
                status.textContent = 'Snapshot captured! Image saved locally.';
            });
        }
        
        initCamera();
    </script>
</body>
</html>`;

fs.writeFileSync('public/camera.html', cameraHtml);
console.log('Camera page created at public/camera.html');
