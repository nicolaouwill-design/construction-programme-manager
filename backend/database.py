from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR}/construction_program.db"
)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")


class MagicToken(Base):
    __tablename__ = "magic_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    address = Column(String)
    client = Column(String)
    revision = Column(String, default="REV 1")
    status_date = Column(String)
    working_days = Column(Integer, default=6)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="projects")
    activities = relationship("Activity", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")


class Activity(Base):
    __tablename__ = "activities"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    task_id = Column(Integer, nullable=False)          # MS Project style ID
    wbs = Column(String)                               # e.g. "1.2.3"
    name = Column(String, nullable=False)
    duration_days = Column(Float, default=0)
    duration_weeks = Column(Float, default=0)
    start_date = Column(String)
    finish_date = Column(String)
    percent_complete = Column(Float, default=0)
    resource_names = Column(String)
    parent_id = Column(Integer, ForeignKey("activities.id"), nullable=True)
    indent_level = Column(Integer, default=0)
    is_summary = Column(Boolean, default=False)
    is_milestone = Column(Boolean, default=False)
    is_critical = Column(Boolean, default=False)
    is_near_critical = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    notes = Column(Text)
    color = Column(String)
    project = relationship("Project", back_populates="activities")
    children = relationship("Activity", foreign_keys=[parent_id], backref="parent", remote_side="Activity.id")


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String)
    file_size = Column(Integer)
    status = Column(String, default="uploaded")   # uploaded, processing, processed, error
    extracted_text = Column(Text)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    project = relationship("Project", back_populates="documents")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
