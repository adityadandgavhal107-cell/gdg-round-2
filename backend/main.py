from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import datetime

import models
from database import engine, get_db
import schemas

# Generate database tables automatically on launch
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FireGuard HMS Data Backend")

# Enable Cross-Origin Resource Sharing (CORS) for your Vite Dev Server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to auto-assign priority based on constraints
def calculate_priority(age: int, special_needs: str) -> str:
    needs = special_needs.lower() if special_needs else ""
    if "wheelchair" in needs or "medical" in needs:
        return "P1 – Critical"
    elif age <= 12 or "elderly" in needs or "children" in needs:
        return "P2 – High"
    elif age >= 60:
        return "P3 – Medium"
    return "P4 – Standard"

# --- CRUD ENDPOINTS ---

@app.post("/api/guests", response_model=schemas.GuestResponse, status_code=status.HTTP_201_CREATED)
def check_in_guest(guest: schemas.GuestCreate, db: Session = Depends(get_db)):
    # Check if duplicate contact exists
    db_guest = db.query(models.Guest).filter(models.Guest.contact_number == guest.contact_number).first()
    if db_guest:
        raise HTTPException(status_code=400, detail="Contact number already registered.")
    
    computed_priority = calculate_priority(guest.age, guest.special_needs)

    # Resolve check-in/check-out dates and nights
    today = datetime.date.today()
    check_in = guest.check_in_date or today
    check_out = guest.check_out_date or (today + datetime.timedelta(days=1))
    delta = (check_out - check_in).days
    nights = max(delta, 1)
    
    new_guest = models.Guest(
        full_name=guest.full_name,
        age=guest.age,
        room_assignment=guest.room_assignment,
        contact_number=guest.contact_number,
        special_needs=guest.special_needs,
        priority=computed_priority,
        zone_status="Safe",
        is_evacuated=False,
        check_in_date=check_in,
        check_out_date=check_out,
        nights=nights
    )
    db.add(new_guest)
    db.commit()
    db.refresh(new_guest)
    return new_guest

@app.get("/api/guests", response_model=List[schemas.GuestResponse])
def get_all_guests(db: Session = Depends(get_db)):
    return db.query(models.Guest).all()

@app.patch("/api/guests/{guest_id}/evacuate", response_model=schemas.GuestResponse)
def toggle_evacuation_status(guest_id: int, db: Session = Depends(get_db)):
    guest = db.query(models.Guest).filter(models.Guest.id == guest_id).first()
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    
    guest.is_evacuated = not guest.is_evacuated
    guest.zone_status = "Evacuated" if guest.is_evacuated else "Safe"
    
    db.commit()
    db.refresh(guest)
    return guest

@app.delete("/api/guests/{guest_id}", status_code=status.HTTP_204_NO_CONTENT)
def checkout_guest(guest_id: int, db: Session = Depends(get_db)):
    guest = db.query(models.Guest).filter(models.Guest.id == guest_id).first()
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    db.delete(guest)
    db.commit()
    return None


# --- AUTO-EVICTION ENDPOINT ---
# Called by the Node.js cron job (server.js) at 11:00 AM daily.
# Deletes all guests whose check_out_date equals today's date.

@app.delete("/api/guests/auto-evict", status_code=status.HTTP_200_OK)
def auto_evict_guests(db: Session = Depends(get_db)):
    today = datetime.date.today()
    expired = db.query(models.Guest).filter(models.Guest.check_out_date == today).all()
    count = len(expired)
    for guest in expired:
        db.delete(guest)
    db.commit()
    return {"evicted": count, "date": str(today)}


# Add these imports at the top of your main.py if not present


# --- AUTHENTICATION ENDPOINT FOR GUESTS ---

@app.post("/api/v1/auth/guest-login")
def guest_login(payload: schemas.GuestLoginRequest, db: Session = Depends(get_db)):
    # 1. Fetch all guests from database to match against parsed first names
    all_guests = db.query(models.Guest).all()
    
    input_first_name = payload.login_id.strip().lower()
    input_password = payload.password.strip().lower()
    
    for guest in all_guests:
        # Split "Priya Sharma" into ["Priya", "Sharma"] and take the first index
        name_parts = guest.full_name.strip().split()
        if not name_parts:
            continue
            
        first_name = name_parts[0].lower()
        room = str(guest.room_assignment).strip()
        
        # Check if input matches the first name
        if first_name == input_first_name:
            # Generate target credential formula: first 3 characters of name + room number
            expected_passcode = f"{first_name[:3]}{room}"
            
            # 2. Check if the computed passcode matches the input password
            if input_password == expected_passcode:
                return {
                    "success": True, 
                    "message": "Access granted.",
                    "guest": {
                        "id": guest.id,
                        "full_name": guest.full_name,
                        "room": room,
                        "check_out_date": str(guest.check_out_date) if guest.check_out_date else None,
                        "nights": guest.nights,
                    }
                }
                
    # If loop completes without hitting a return statement, auth failed
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, 
        detail="Invalid guest name or room passkey generation combination."
    )