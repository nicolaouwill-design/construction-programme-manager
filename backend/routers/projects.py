from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from database import get_db, Project, Activity, User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    address: Optional[str] = None
    client: Optional[str] = None
    revision: Optional[str] = "REV 1"
    working_days: Optional[int] = 6


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    client: Optional[str] = None
    revision: Optional[str] = None
    status_date: Optional[str] = None
    working_days: Optional[int] = None


def _project_row(p: Project, activity_count: int) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "address": p.address,
        "client": p.client,
        "revision": p.revision,
        "status_date": p.status_date,
        "working_days": p.working_days,
        "activity_count": activity_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
def list_projects(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    query = db.query(Project)
    if current_user:
        query = query.filter(Project.user_id == current_user.id)
    projects = query.all()
    result = []
    for p in projects:
        count = db.query(func.count(Activity.id)).filter(Activity.project_id == p.id).scalar()
        result.append(_project_row(p, count))
    return result


@router.post("")
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    project = Project(**data.dict(), user_id=current_user.id if current_user else None)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"id": project.id, "name": project.name, "revision": project.revision}


@router.get("/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user and project.user_id and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "id": project.id,
        "name": project.name,
        "address": project.address,
        "client": project.client,
        "revision": project.revision,
        "status_date": project.status_date,
        "working_days": project.working_days,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.put("/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user and project.user_id and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    for key, value in data.dict(exclude_none=True).items():
        setattr(project, key, value)
    project.updated_at = datetime.utcnow()
    db.commit()
    return {"id": project.id, "name": project.name}


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user and project.user_id and project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(project)
    db.commit()
    return {"deleted": True}
