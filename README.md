# 🔥 FireGuard HMS

### Smart Hotel Fire Safety & Emergency Response System

<p align="center">
  Intelligent Fire Detection • Real-Time Emergency Response • Guest Safety • IoT Integration
</p>

---

# 📖 Overview

FireGuard HMS (Hotel Management & Safety System) is an intelligent emergency management platform developed to improve hotel safety during fire incidents and other emergencies.

The system combines:

* 🔥 Arduino-based fire detection
* 🚨 Guest-triggered emergency alerts
* 📡 Real-time WebSocket communication
* 🎙️ Voice-guided evacuation assistance
* 📹 Camera monitoring interfaces
* 🏨 Multi-role dashboards
* 🧭 Smart evacuation routing

into a unified emergency response ecosystem.

The platform enables hotel administrators, guests, and disaster response teams to coordinate effectively during critical situations, reducing response time and improving evacuation efficiency.

---

# 🚀 Live Deployment

### Frontend

https://fireguard-frontend.onrender.com

### Backend API

https://fireguard-backend-abhx.onrender.com

---

# ✨ Core Features

## 🔥 Dual Fire Alert System

FireGuard HMS supports two independent emergency alert sources.

### 1. Arduino-Based Fire Detection

The hardware monitoring unit continuously checks environmental conditions using:

* Flame Sensor
* MQ Smoke Sensor
* Arduino Controller
* Buzzer Alert Module

When dangerous conditions are detected:

* Fire alert is generated automatically
* Backend receives incident data
* Emergency broadcast is triggered
* Dashboards update instantly

---

### 2. Guest Emergency Trigger

Guests can manually report emergencies using the Guest Dashboard.

Features:

* One-click emergency activation
* SOS request generation
* Instant alert escalation
* Real-time notification delivery
* Emergency coordination support

---

# 📡 Real-Time Emergency Communication

Built using Socket.io and WebSocket architecture.

Capabilities:

* Instant alert broadcasting
* Live dashboard synchronization
* Emergency event streaming
* Real-time status updates
* Low-latency communication

---

# 🏨 Multi-Role Dashboard Architecture

## Admin Dashboard

Hotel command center for emergency management.

Features:

* Fire alert monitoring
* Incident management
* Camera access
* Guest tracking
* Emergency activation controls
* Alert acknowledgment
* Live hotel status overview

---

## Guest Dashboard

Safety-focused guest interface.

Features:

* OTP Authentication
* Emergency notifications
* Fire alerts
* SOS generation
* Emergency trigger button
* Evacuation guidance
* Voice-assisted instructions

---

## DAF Dashboard

Disaster Assistance Force coordination platform.

Features:

* Tactical response interface
* Incident overview
* Guest rescue prioritization
* Emergency coordination
* Real-time incident tracking
* Response management

---

# 🎙️ Voice Guidance System

FireGuard HMS includes an evacuation assistance engine with voice guidance support.

Modules:

* RouteToSpeech
* VoiceGuidanceService
* useVoiceGuidance Hook

Capabilities:

* Spoken evacuation instructions
* Route-based navigation guidance
* Emergency assistance support
* Accessibility enhancement

---

# 📹 Camera Monitoring System

Dedicated room-based camera monitoring interface.

Features:

* Room camera access
* Emergency verification
* Incident visualization
* Real-time monitoring
* Admin and DAF access

Route:

```bash
/cam?room=101
```

---

# 🧭 Smart Evacuation Engine

The platform calculates evacuation routes using building and room data.

Core Components:

* EvacuationEngine.js
* LocationEstimator.js
* pathToSteps.js

Features:

* Safe route generation
* Exit recommendations
* Hazard-aware evacuation logic
* Dynamic navigation support

---

# 🤖 Simulation & Alert Engine

FireGuard HMS includes a simulation environment for drills and testing.

Components:

* SimulationEngine.js
* AlertEngine.js
* EventBus.js

Capabilities:

* Fire simulations
* Alert testing
* Emergency workflow validation
* Training exercises

---

# 🛠 Hardware Integration

## Arduino Fire Detection Unit

### Components

* Arduino Uno
* Flame Sensor
* MQ Smoke Sensor
* Buzzer
* LED Indicators

### Workflow

```plaintext
Smoke/Flame Detected
          │
          ▼
 Arduino Controller
          │
          ▼
 Backend API
          │
          ▼
 Alert Engine
          │
          ▼
 WebSocket Broadcast
          │
 ┌────────┼─────────┐
 ▼        ▼         ▼

Admin   Guest      DAF
Panel   Panel     Panel
```

---

# 🏗 System Architecture

```plaintext
                     FIREGUARD HMS

        ┌─────────────────────────────┐
        │ Arduino Detection System    │
        │ Smoke + Flame Sensors       │
        └──────────────┬──────────────┘
                       │

                       ▼

                FastAPI Backend
          (Incident Processing Layer)

                       ▲
                       │

       Guest Emergency Trigger Button

                       │

                       ▼

               Alert Management

                       │

                       ▼

               Socket.io Server

                       │

      ┌────────────┬────────────┬────────────┐

      ▼            ▼            ▼            ▼

   Admin        Guest         DAF       Camera
 Dashboard    Dashboard    Dashboard    Client

                       │

                       ▼

            Voice Guidance Engine
```

---

# 💻 Technology Stack

## Frontend

```bash
React.js
Vite
JavaScript
HTML5
CSS3
Socket.io Client
```

## Backend

```bash
Python
FastAPI
SQLite
Pydantic
SQLAlchemy
```

## Real-Time Communication

```bash
Socket.io
WebSockets
```

## Hardware

```bash
Arduino Uno
MQ Smoke Sensor
Flame Sensor
Buzzer
LED Module
```

## Deployment

```bash
Render
GitHub
```

---

# 📂 Project Structure

```plaintext
backend/
├── database.py          # DB setup
├── main.py              # API entry
├── models.py            # DB models
├── schemas.py           # API schemas
├── fireguard.db         # SQLite DB
└── requirements.txt     # Dependencies

src/
├── ai/
│   ├── DetectionOverlay.js    # Fire overlay
│   └── MockDetector.js        # Fire simulation
│
├── components/
│   ├── AlertPanel.jsx         # Alerts UI
│   ├── LandingPage.jsx        # Home page
│   ├── Sidebar.jsx            # Navigation
│   ├── TopBar.jsx             # Header
│   └── PersistentAlertOverlay.jsx # Emergency overlay
│
├── core/
│   ├── AlertEngine.js         # Alert logic
│   ├── EvacuationEngine.js    # Evacuation logic
│   ├── EventBus.js            # Event manager
│   ├── LocationEstimator.js   # Room tracking
│   ├── SimulationEngine.js    # Fire simulator
│   ├── VoiceAssistant.js      # Voice alerts
│   └── WebRTCManager.js       # Camera streams
│
├── data/
│   ├── guests.js              # Guest data
│   └── hotel.js               # Hotel data
│
├── views/
│   ├── CameraGrid.jsx         # Camera dashboard
│   ├── DAFTeamView.jsx        # DAF panel
│   ├── GuestDashboard.jsx     # Guest panel
│   ├── HotelView3D.jsx        # 3D hotel map
│   ├── LoginPortal.jsx        # Login page
│   ├── NavigationView.jsx     # Route view
│   └── SensorSimPanel.jsx     # Sensor monitor
│
├── voice-guidance/
│   ├── RouteToSpeech.js       # Route voice
│   ├── useVoiceGuidance.js    # Voice hook
│   └── VoiceGuidanceService.js # Voice service
│
├── App.jsx                    # Admin app
├── GuestApp.jsx               # Guest app
├── DAFApp.jsx                 # DAF app
└── main.jsx                   # Frontend entry
```

---

# 🔐 Authentication

### Guest Authentication

* OTP-based login
* Room-specific access
* Secure verification workflow

### Admin Access

* Incident management permissions
* Hotel monitoring controls

### DAF Access

* Emergency response authorization
* Tactical command access

---

# ⚙️ Installation

### Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/fireguard-hms.git
cd fireguard-hms
```

### Install Frontend Dependencies

```bash
npm install
```

### Start Frontend

```bash
npm run dev
```

### Setup Backend

```bash
cd backend
pip install -r requirements.txt
```

### Run Backend

```bash
uvicorn main:app --reload
```

---

# 🌐 Application Routes

| Route           | Description      |
| --------------- | ---------------- |
| `/`             | Admin Dashboard  |
| `/guest`        | Guest Dashboard  |
| `/daf`          | DAF Dashboard    |
| `/cam?room=101` | Camera Interface |

---

# 🎯 Use Cases

### Hotels

* Fire monitoring
* Emergency preparedness
* Incident management

### Guests

* Emergency reporting
* Safety assistance
* Evacuation support

### Disaster Response Teams

* Rescue coordination
* Tactical planning
* Incident awareness

---

# 🔮 Future Enhancements

* AI-powered CCTV fire detection
* Computer vision smoke recognition
* Firebase push notifications
* Mobile application
* PDF incident reports
* Evidence image uploads
* Predictive fire-risk analytics
* Indoor navigation optimization

---

# 👥 Team Members

* Aditya Dandgavhal
* Yash Bhandari
* Ayush Mishra
* Taranveer Singh Vig

---

# 📜 License

This project was developed for educational, research, innovation, and hackathon purposes.

© 2026 FireGuard HMS Team
