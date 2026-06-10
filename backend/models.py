from sqlalchemy import Column, Integer, String, Boolean,Date
from database import Base
import datetime

class Guest(Base):
    __tablename__ = "guests"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False, index=True)
    contact_number = Column(String, nullable=False, unique=True)
    room_assignment = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    
    # Special Needs stored as a comma-separated string (e.g., "Elderley,Medical")
    special_needs = Column(String, default="None")

    # Stay duration fields
    check_in_date = Column(Date, nullable=False, default=datetime.date.today)
    check_out_date = Column(Date, nullable=True)
    nights = Column(Integer, default=1)
    
    # UI Attributes mapping to your dashboard rules
    priority = Column(String, default="P4 – Standard") # P1, P2, P4
    zone_status = Column(String, default="Safe")       # Safe, Affected, Evacuated
    is_evacuated = Column(Boolean, default=False)