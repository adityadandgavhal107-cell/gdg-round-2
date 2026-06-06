# FireGuard HMS  
### Smart Hotel Fire Safety and Emergency Response System

---

## Overview

FireGuard HMS is an intelligent hotel fire safety and emergency management platform designed to improve incident response, guest safety, and operational coordination during fire emergencies. The system integrates real-time alert monitoring, camera surveillance, emergency dashboards, and tactical response management into a unified platform.

The project provides dedicated interfaces for hotel administrators, guests, and emergency response teams to ensure faster decision-making and safer evacuation procedures.

---

## Key Features

- Real-time fire alert detection and monitoring  
- Dedicated dashboards for hotel staff, guests, and emergency teams  
- Camera monitoring and room-based access system  
- Emergency navigation and evacuation guidance  
- Alert engine and incident simulation system  
- WebSocket-based real-time communication architecture  
- Multi-page dashboard deployment support  

---

## System Modules

| Module | Description |
|--------|-------------|
| **Admin Dashboard** | Central monitoring and incident management |
| **Guest Dashboard** | Emergency guidance and evacuation support |
| **DAF Dashboard** | Tactical response and coordination interface |
| **Camera Client** | Room-based live monitoring interface |

---

## Technology Stack

### Frontend
```bash
React.js
Vite
JavaScript
HTML5
CSS3
```

### Backend
```bash
Node.js
Express.js
Socket.io
```

### Deployment
```bash
Vercel (Frontend)
Railway / Render (Backend)
```

---

## Project Structure

```plaintext
src/
├── ai/                # Fire detection and AI-related modules
├── assets/            # Static assets and media
├── components/        # Reusable UI components
├── core/              # Core logic, alert engine, WebRTC, simulation
├── data/              # Mock hotel and guest data
├── views/             # Application dashboards and screens
```

---

## Installation and Setup

### Clone the Repository

```bash
git clone https://github.com/your-username/fireguard-hms.git
cd fireguard-hms
```

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

---

## Deployment

### Frontend Deployment

The frontend application is configured for deployment on Vercel with support for multiple dashboard routes.

### Backend Deployment

The backend signaling server (`server.js`) should be deployed separately on Railway or Render to support real-time communication features.

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SOCKET_URL=https://your-backend-url.railway.app
```

---

## Application Routes

| Route | Interface |
|-------|------------|
| `/` | Admin Dashboard |
| `/guest` | Guest Dashboard |
| `/daf` | DAF Dashboard |
| `/cam?room=101` | Camera Monitoring Interface |

---

## Use Case

FireGuard HMS is designed to support hotels in improving emergency preparedness, enhancing fire incident response, and ensuring safer evacuation processes for guests and staff.

---

## Author

**Aditya Prakash Dandgavhal**

---

## License

This project was developed for educational and hackathon purposes.
