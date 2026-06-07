from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Using SQLite locally. It will create a 'fireguard.db' file in the backend folder.
DATABASE_URL = "sqlite:///./fireguard.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}  # Needed only for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to yield database sessions to API endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()