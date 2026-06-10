from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Local SQLite configuration
DATABASE_URL = "sqlite:///./fireguard.db"

# 1. Added a 30-second timeout to give concurrent writes a chance to queue safely
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False, "timeout": 30}
)

# 2. Force SQLite to use WAL Mode and Normal Synchronization on connection
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    # WAL mode allows simultaneous reads and non-blocking writes
    cursor.execute("PRAGMA journal_mode=WAL")
    # NORMAL sync balances speed and safety perfectly for web development
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to yield database sessions to API endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()  # Properly disposes connection back to pool, releasing locks