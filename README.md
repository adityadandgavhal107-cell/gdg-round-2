# 🔥 FireGuard HMS
### *Intelligent Hotel Fire Safety & Emergency Response Platform*

> Real-time fire detection, AI-powered threat analysis, and guided evacuation — all in one unified command dashboard for hotels.

---

## 🚨 What Is FireGuard HMS?

FireGuard HMS is a full-stack hotel emergency management system that detects fire and smoke threats using live camera feeds, Arduino hardware sensors, and AI analysis — then instantly coordinates evacuation routes, alerts guests on their phones, and dispatches DAF (Deployable Autonomous Firefighting) teams to the right location. Think of it as a **"smart brain" for hotel fire safety** that replaces passive alarm systems with active, data-driven emergency response.

---

## ✨ Key Features

- 🏨 **Interactive 3D Hotel Map** — A real-time Three.js 3D model of the hotel visualizes which rooms are on fire, filled with smoke, or safe. Color changes propagate live as hazards are detected.

- 🔥 **Multi-Stage AI Fire Detection** — Cameras run a 5-stage computer vision pipeline (HSV color masking → YCrCb chroma analysis → contour geometry → temporal flicker → confidence fusion) directly in the browser to detect fire and smoke without sending video to a server.

- 🔌 **Arduino Hardware Integration** — Real smoke/fire sensors connected via serial port (COM3) feed live readings into the system. A Web Serial API fallback lets you connect Arduino directly from Chrome without any drivers.

- 📱 **Guest Emergency App** — A mobile-friendly PWA guests access on their phones. It shows their evacuation route, lets them trigger SOS alerts (fire, medical, security), and speaks turn-by-turn directions in English or Hindi via text-to-speech.

- 🚒 **DAF Tactical Dashboard** — A separate locked dashboard for firefighting teams with team-specific OTP authentication, real-time incident prioritization, rescue pathfinding, and live camera PiP (picture-in-picture).

- 🗺️ **Hazard-Aware Dijkstra Routing** — Evacuation paths are computed using a weighted graph of the hotel. Fire rooms become impassable (`cost = Infinity`), smoke rooms get high cost, and buffer zones are slightly penalized — so routes automatically re-route around hazards.

- 📹 **WebRTC Live Camera Grid** — Smartphones become surveillance cameras by opening `/cam.html?room=101`. The admin dashboard receives the stream peer-to-peer with zero latency, with AI detection overlays rendered on canvas.

- 🌐 **Real-Time Socket.io Architecture** — Every alert, hazard update, camera registration, and DAF resolution is broadcast in real time using WebSockets. All dashboards stay synchronized automatically.

- 🗣️ **Multilingual Voice Guidance** — The guest evacuation view supports English and Hindi, with a carefully curated voice preference list to pick the warmest available TTS voice on the device.

- 🏗️ **Python FastAPI Backend** — Manages guest check-in/check-out with SQLite (via SQLAlchemy), priority auto-calculation, and an automated 11 AM eviction cron job.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | React 19, Vite 8 |
| **3D Rendering** | Three.js (r183) with OrbitControls & CSS2DRenderer |
| **Real-Time Comms** | Socket.io 4 (WebSocket + polling fallback) |
| **Peer-to-Peer Video** | WebRTC (browser-native, STUN via Google) |
| **AI / Vision** | Custom browser-side HSV + YOLOv8 + flicker detector , Gemini API |
| **Audio Detection** | Web Audio API FFT (fire alarm frequency: 2000–4000 Hz) |
| **Voice Guidance** | Web Speech API (SpeechSynthesis + SpeechRecognition) |
| **Signaling Server** | Node.js + Express 5 + Socket.io |
| **REST API Backend** | Python FastAPI + SQLAlchemy + SQLite (WAL mode) |
| **Hardware** | Arduino (serial via Node.js `serialport` or browser Web Serial API) |
| **Scheduling** | `node-cron` for daily auto-eviction at 11 AM |
| **Deployment** | Vercel (frontend), Render (Node.js backend), Render (FastAPI) |

---

## 🏗️ Architecture & File Structure

### Simplified Directory Tree

```
fireguard-hms/
├── index.html              # Admin Dashboard entry point
├── guest.html              # Guest mobile portal entry point
├── daf.html                # DAF tactical team entry point
├── cam.html                # Camera streaming entry point
├── server.js               # Node.js signaling + hazard state server
├── vercel.json             # Frontend routing config
├── vite.config.js          # Build config with multi-page + proxy
│
├── backend/                # Python FastAPI REST backend
│   ├── main.py             # API routes (guest CRUD, auth, eviction)
│   ├── models.py           # SQLAlchemy Guest model
│   ├── schemas.py          # Pydantic request/response schemas
│   ├── database.py         # SQLite engine (WAL mode)
│   └── requirements.txt
│
└── src/
    ├── main.jsx            # Admin dashboard root
    ├── main-guest.jsx      # Guest app root
    ├── daf-main.jsx        # DAF app root
    ├── cam.js              # Camera AI detection + WebRTC (vanilla JS)
    ├── App.jsx             # Admin dashboard shell + socket management
    ├── GuestApp.jsx        # Guest evacuation app
    ├── DAFApp.jsx          # DAF tactical dashboard
    │
    ├── core/
    │   ├── AlertEngine.js      # Detection → alert lifecycle + persistence
    │   ├── EventBus.js         # In-process pub/sub (replay-capable)
    │   ├── WebRTCManager.js    # Admin-side WebRTC peer connections
    │   ├── EvacuationEngine.js # Guest path tracking + recalculation
    │   └── config.js           # Socket URL environment config
    │
    ├── data/
    │   ├── hotel.js            # Hotel graph + Dijkstra pathfinder
    │   └── guests.js           # Priority calculation + mock data
    │
    ├── views/
    │   ├── HotelView3D.jsx     # Three.js 3D hotel renderer
    │   ├── CameraGrid.jsx      # WebRTC camera tile grid
    │   ├── GuestDashboard.jsx  # Guest check-in/out management
    │   ├── DAFTeamView.jsx     # Team dispatch + OTP management
    │   ├── SensorSimPanel.jsx  # Arduino + sensor simulation panel
    │   └── NavigationView.jsx  # First-person corridor POV for guests
    │
    ├── components/
    │   ├── AlertPanel.jsx              # Live alert sidebar
    │   ├── PersistentAlertOverlay.jsx  # Always-on alert banner
    │   ├── LandingPage.jsx             # Login portal (Admin/Guest/DAF)
    │   └── SplashScreen.jsx            # Animated boot screen
    │
    ├── ai/
    │   ├── DetectionOverlay.js # Canvas bounding-box renderer
    │   └── MockDetector.js     # Simulated detections for demo mode
    │
    └── voice-guidance/
        ├── VoiceGuidanceService.js  # TTS queue manager + voice selection
        ├── RouteToSpeech.js         # Path array → spoken instructions
        └── useVoiceGuidance.js      # React hook wrapper
```

### How Data Flows

```
Camera Phone ──WebRTC──► Admin Dashboard (live video)
     │                        │
     │ AI Detection            │ Manual trigger / Arduino reading
     ▼                        ▼
Node.js server.js  ◄──── detection:manual (Socket.io)
     │
     ├─ propagateFireHazards(roomId)
     │     → marks fire room, smoke neighbors, buffer zones
     │
     ├─ hazards:update ──────► All Clients (Admin, Guest, DAF)
     │
     └─ detection:alert ─────► AlertEngine.js (in browser)
                                    │
                            alert:new → UI badges, 3D map colors,
                                        PersistentAlertOverlay,
                                        Guest SOS notifications
```

> **Key design decision:** The Node.js server is the **single source of truth** for hazard state (`const hazards = {}`). All clients receive `hazards:init` on connect and `hazards:update` on every change. The browser-side `AlertEngine.js` handles the UI lifecycle (deduplication, persistence to `localStorage`, resolve flows).

---

## ⚙️ Prerequisites

Before you start, make sure you have these installed:

| Tool | Version | Why You Need It |
|------|---------|-----------------|
| **Node.js** | ≥ 20.19 | Runs the Vite dev server and the Node.js signaling server |
| **Python** | ≥ 3.9 | Runs the FastAPI guest management backend |
| **npm** | ≥ 10 | Installs JavaScript dependencies |
| **pip** | latest | Installs Python dependencies |

> 💡 **Beginner tip:** Check your versions by running `node --version`, `python --version`, and `npm --version` in your terminal.

---

## 🚀 Getting Started

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-username/fireguard-hms.git
cd fireguard-hms
```

### Step 2 — Install JavaScript dependencies

```bash
npm install
```

### Step 3 — Set up the Python backend

```bash
cd backend
pip install -r requirements.txt
cd ..
```

> If you're on a newer Linux/macOS system and get an error, try:
> ```bash
> pip install -r requirements.txt --break-system-packages
> ```
> Or create a virtual environment first:
> ```bash
> # macOS/Linux
> python -m venv venv && source venv/bin/activate
>
> # Windows
> python -m venv venv && venv\Scripts\activate
> ```

### Step 4 — Configure environment variables

Create a `.env` file in the **project root**:

```env
# URL of the Node.js signaling server
# Leave as-is for local development — Vite proxies /socket.io automatically
VITE_SOCKET_URL=http://localhost:3001

# URL of your deployed Python FastAPI backend (or leave blank to use Vite proxy)
VITE_API_URL=http://localhost:8000/api
```

For **production deployments**, set these in your Vercel dashboard (frontend) and your Node.js hosting platform:

```env
# On your Node.js server (Railway/Render)
CORS_ORIGINS=https://your-app.vercel.app
```

### Step 5 — Run everything locally

You need **three terminal windows** running simultaneously:

**Terminal 1 — Vite frontend dev server:**
```bash
npm run dev
```

**Terminal 2 — Node.js signaling + hazard server:**
```bash
npm run server
# Or directly:
node server.js
```

**Terminal 3 — Python FastAPI backend:**
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Step 6 — Open in your browser

| URL | What You'll See |
|-----|----------------|
| `http://localhost:5173` | 🛡️ Admin Dashboard |
| `http://localhost:5173/guest` | 📱 Guest Safety Portal |
| `http://localhost:5173/daf` | 🚒 DAF Tactical Dashboard |
| `http://localhost:5173/cam?room=101` | 📹 Camera streaming client |

> **Default admin credentials:** username `admin` / password `admin123`

---

## 📖 Usage / How It Works

### 🛡️ For Hotel Staff (Admin)

1. **Log in** with `admin` / `admin123` at the landing page.
2. The **3D hotel map** loads — 8 floors × 12 rooms rendered in Three.js.
3. **Check in a guest** using the Guest Management tab. Priority (P1–P4) is auto-calculated from age and special needs.
4. When a camera phone connects to `/cam.html?room=101`, it appears in the **Camera Grid** and starts AI fire detection automatically.
5. If fire is detected, the **3D map** turns the affected room **red**, neighboring rooms **orange** (smoke), and outer rooms **yellow** (buffer zone). A persistent alert banner activates at the top of the screen.

---

### 📱 For Guests (Mobile)

1. Open the **Guest Portal** on your phone and log in with your name + passcode.
   > Default passcode format: first 3 letters of name + room number (e.g., `Pri101` for Priya in Room 101).
2. In an emergency, tap **TRIGGER ALERT** to send an SOS to the admin dashboard.
3. Navigate to the **Evac Map** tab to see your personalized evacuation route — automatically re-routed around fire-blocked corridors using Dijkstra's algorithm.
4. Switch to **First Person POV** for step-by-step corridor **navigation with voice guidance in English or Hindi**.

---

### 🚒 For DAF Teams (Firefighters)

1. Open `/daf` and enter your **4-digit team OTP** (generated by the admin under the DAF Teams tab).
2. Active fire incidents appear in the sidebar, sorted by severity.
3. Click **NAVIGATE** to see the optimal rescue path overlaid on the 3D hotel map.
4. Click **CLEAR ZONE** when a room is secured — this resolves the alert across **all dashboards simultaneously**.

---

### 🔌 Arduino Sensor 

1. Connect your Arduino to **COM3** with a smoke/MQ-2 sensor sketch that prints `FIRE DETECTED` or `SMOKE DETECTED` over serial.
2. The Node.js server reads the serial port automatically and propagates hazards in real time.
3. Alternatively, click **Connect Web Serial** in the Sensor Control Panel to use the browser's built-in serial API (**Chrome only**).

---

## 🔮 Future Roadmap

- **🤖 Illuminated Path for Emergency Evacuation** - An intelligent, hazard-aware evacuation system that dynamically routes and illuminates safe paths through hotel corridors during emergency situations.

- **🔔 Push Notifications & SMS** — Integrate Twilio or Firebase Cloud Messaging to send SMS/push alerts to guests' phones when a fire is detected in or near their room.

- **🗄️ Multi-Hotel Support** — Extend the architecture to support multiple hotel properties under a single admin account, with per-property sensor and guest management.

---

## 👨‍💻 Author

**Aditya Prakash Dandgavhal**

---

## 📄 License

This project was developed for educational and hackathon purposes.
