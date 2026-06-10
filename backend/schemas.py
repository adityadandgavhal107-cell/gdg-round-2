from pydantic import BaseModel
from typing import Optional
import datetime

# Base properties shared on creation and reading
class GuestBase(BaseModel):
    full_name: str
    age: int
    room_assignment: str
    contact_number: Optional[str] = None
    special_needs: Optional[str] = "None"
    check_in_date: Optional[datetime.date] = None
    check_out_date: Optional[datetime.date] = None
    nights: Optional[int] = 1

# Schema expected when checking in a new guest via the UI Form
class GuestCreate(GuestBase):
    pass

# Schema returned back to the UI table view
class GuestResponse(GuestBase):
    id: int
    priority: str
    zone_status: str
    is_evacuated: bool

    class Config:
        from_attributes = True # Enables SQLAlchemy model mapping



class GuestLoginRequest(BaseModel):
    login_id: str  
    password: str  