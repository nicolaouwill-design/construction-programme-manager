from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from database import get_db, Activity, Project

router = APIRouter(prefix="/api/projects", tags=["activities"])


class ActivityCreate(BaseModel):
    task_id: Optional[int] = None
    wbs: Optional[str] = None
    name: str
    duration_days: Optional[float] = 0
    duration_weeks: Optional[float] = 0
    start_date: Optional[str] = None
    finish_date: Optional[str] = None
    percent_complete: Optional[float] = 0
    resource_names: Optional[str] = None
    parent_id: Optional[int] = None
    indent_level: Optional[int] = 0
    is_summary: Optional[bool] = False
    is_milestone: Optional[bool] = False
    is_critical: Optional[bool] = False
    is_near_critical: Optional[bool] = False
    sort_order: Optional[int] = 0
    notes: Optional[str] = None
    color: Optional[str] = None


class ActivityUpdate(BaseModel):
    name: Optional[str] = None
    duration_days: Optional[float] = None
    duration_weeks: Optional[float] = None
    start_date: Optional[str] = None
    finish_date: Optional[str] = None
    percent_complete: Optional[float] = None
    resource_names: Optional[str] = None
    parent_id: Optional[int] = None
    indent_level: Optional[int] = None
    is_summary: Optional[bool] = None
    is_milestone: Optional[bool] = None
    is_critical: Optional[bool] = None
    is_near_critical: Optional[bool] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None
    color: Optional[str] = None


class BulkActivities(BaseModel):
    activities: List[ActivityCreate]


def activity_to_dict(a: Activity) -> dict:
    return {
        "id": a.id,
        "task_id": a.task_id,
        "wbs": a.wbs,
        "name": a.name,
        "duration_days": a.duration_days,
        "duration_weeks": a.duration_weeks,
        "start_date": a.start_date,
        "finish_date": a.finish_date,
        "percent_complete": a.percent_complete,
        "resource_names": a.resource_names,
        "parent_id": a.parent_id,
        "indent_level": a.indent_level,
        "is_summary": a.is_summary,
        "is_milestone": a.is_milestone,
        "is_critical": a.is_critical,
        "is_near_critical": a.is_near_critical,
        "sort_order": a.sort_order,
        "notes": a.notes,
        "color": a.color,
    }


@router.get("/{project_id}/activities")
def get_activities(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    activities = (
        db.query(Activity)
        .filter(Activity.project_id == project_id)
        .order_by(Activity.sort_order)
        .all()
    )
    return [activity_to_dict(a) for a in activities]


@router.post("/{project_id}/activities")
def create_activity(project_id: int, data: ActivityCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Auto-assign task_id if not provided
    if not data.task_id:
        max_id = db.query(Activity).filter(Activity.project_id == project_id).count()
        data.task_id = max_id + 1

    # Auto-calculate duration_weeks from duration_days
    if data.duration_days and not data.duration_weeks:
        data.duration_weeks = round(data.duration_days / project.working_days, 1)

    activity = Activity(project_id=project_id, **data.dict())
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity_to_dict(activity)


@router.post("/{project_id}/activities/bulk")
def bulk_create_activities(project_id: int, data: BulkActivities, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Clear existing activities
    db.query(Activity).filter(Activity.project_id == project_id).delete()

    activities = []
    for i, act_data in enumerate(data.activities):
        if not act_data.task_id:
            act_data.task_id = i + 1
        if act_data.duration_days and not act_data.duration_weeks:
            act_data.duration_weeks = round(act_data.duration_days / project.working_days, 1)
        act_dict = act_data.dict()
        act_dict["sort_order"] = i
        activity = Activity(project_id=project_id, **act_dict)
        activities.append(activity)

    db.bulk_save_objects(activities)
    db.commit()
    return {"created": len(activities)}


@router.put("/{project_id}/activities/{activity_id}")
def update_activity(project_id: int, activity_id: int, data: ActivityUpdate, db: Session = Depends(get_db)):
    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.project_id == project_id
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    update_data = data.dict(exclude_none=True)

    # Auto-recalculate weeks if days changed
    if "duration_days" in update_data and "duration_weeks" not in update_data:
        project = db.query(Project).filter(Project.id == project_id).first()
        update_data["duration_weeks"] = round(update_data["duration_days"] / project.working_days, 1)

    for key, value in update_data.items():
        setattr(activity, key, value)

    db.commit()
    db.refresh(activity)
    return activity_to_dict(activity)


@router.delete("/{project_id}/activities/{activity_id}")
def delete_activity(project_id: int, activity_id: int, db: Session = Depends(get_db)):
    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.project_id == project_id
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    db.delete(activity)
    db.commit()
    return {"deleted": True}


@router.put("/{project_id}/activities/reorder/bulk")
def reorder_activities(project_id: int, order: List[dict], db: Session = Depends(get_db)):
    """Update sort_order and parent_id for multiple activities at once (drag/drop reorder)"""
    for item in order:
        activity = db.query(Activity).filter(
            Activity.id == item["id"],
            Activity.project_id == project_id
        ).first()
        if activity:
            activity.sort_order = item.get("sort_order", activity.sort_order)
            if "parent_id" in item:
                activity.parent_id = item["parent_id"]
            if "indent_level" in item:
                activity.indent_level = item["indent_level"]
    db.commit()
    return {"updated": len(order)}
