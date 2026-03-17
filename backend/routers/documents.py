import os
import json
import pdfplumber
import anthropic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db, Document, Project, Activity

router = APIRouter(prefix="/api/projects", tags=["documents"])

UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
)
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/{project_id}/documents")
def list_documents(project_id: int, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.project_id == project_id).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "status": d.status,
            "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
        }
        for d in docs
    ]


@router.post("/{project_id}/documents/generate")
def generate_programme(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Manually trigger programme regeneration from all uploaded documents."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    background_tasks.add_task(_generate_programme_task, project_id)
    return {"message": "Programme generation started"}


@router.post("/{project_id}/documents/upload")
async def upload_document(
    project_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Save file
    file_path = os.path.join(UPLOAD_DIR, f"{project_id}_{file.filename}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Create document record
    doc = Document(
        project_id=project_id,
        filename=file.filename,
        file_path=file_path,
        file_type=file.content_type,
        file_size=len(content),
        status="uploaded",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Process in background
    background_tasks.add_task(process_document, doc.id, project_id)

    return {"id": doc.id, "filename": doc.filename, "status": "uploaded"}


def extract_pdf_text(file_path: str) -> str:
    text_parts = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_content = []

                # Extract regular text
                text = page.extract_text()
                if text:
                    page_content.append(text)

                # Extract tables (captures structured schedule data)
                try:
                    tables = page.extract_tables()
                    for table in tables:
                        if not table:
                            continue
                        rows = []
                        for row in table:
                            if row:
                                cleaned = [str(cell).strip() if cell else "" for cell in row]
                                if any(cleaned):
                                    rows.append(" | ".join(cleaned))
                        if rows:
                            page_content.append("[TABLE]\n" + "\n".join(rows) + "\n[/TABLE]")
                except Exception:
                    pass

                if page_content:
                    text_parts.append(f"--- Page {page_num + 1} ---\n" + "\n\n".join(page_content))
    except Exception as e:
        print(f"PDF extraction error: {e}")
    return "\n\n".join(text_parts)


def _load_api_key() -> str:
    """Load API key from environment or .env file."""
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("ANTHROPIC_API_KEY="):
                        key = line.split("=", 1)[1].strip()
                        os.environ["ANTHROPIC_API_KEY"] = key
                        break
    return key


def process_document(doc_id: int, project_id: int):
    from database import SessionLocal, Document, Project, Activity
    import traceback
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        doc.status = "processing"
        db.commit()

        # Extract text from PDF — mark error only if this step fails
        try:
            if doc.file_path.lower().endswith(".pdf"):
                text = extract_pdf_text(doc.file_path)
            else:
                text = ""
            doc.extracted_text = text[:200000]  # Store first 200k chars
            db.commit()
        except Exception as e:
            print(f"PDF extraction failed for doc {doc_id}: {e}\n{traceback.format_exc()}")
            doc.status = "error"
            db.commit()
            return

        # Mark as processed regardless of whether AI generation succeeds
        doc.status = "processed"
        db.commit()

        # Generate/update programme — failure here does not affect doc status
        try:
            generate_programme_from_all_docs(project_id, db)
        except Exception as e:
            print(f"AI generation error for project {project_id}: {e}\n{traceback.format_exc()}")

    except Exception as e:
        import traceback as tb
        print(f"Unexpected error processing document {doc_id}: {e}\n{tb.format_exc()}")
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc and doc.status == "processing":
                doc.status = "error"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _generate_programme_task(project_id: int):
    """Background task wrapper that creates its own DB session."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        generate_programme_from_all_docs(project_id, db)
    finally:
        db.close()


def generate_programme_from_all_docs(project_id: int, db):
    """
    Combine text from all documents for this project and generate
    a comprehensive construction programme using Claude.
    """
    # Gather all extracted text from this project's documents
    docs = db.query(Document).filter(
        Document.project_id == project_id,
        Document.extracted_text.isnot(None),
    ).all()

    if not docs:
        return

    combined_text = ""
    doc_summaries = []
    for doc in docs:
        text = (doc.extracted_text or "").strip()
        if text:
            doc_summaries.append(f"[Document: {doc.filename}]")
            combined_text += f"\n\n=== {doc.filename} ===\n{text}"

    if not combined_text.strip():
        return

    # Truncate to fit within context limits (~400k chars)
    combined_text = combined_text[:400000]

    # Determine whether this looks like an existing schedule or raw documents
    schedule_keywords = ["duration", "start date", "finish date", "percent", "critical", "milestone", "programme", "gantt"]
    drawing_keywords = ["drawing", "elevation", "plan", "section", "specification", "contract", "scope of works", "preliminaries"]

    text_lower = combined_text.lower()
    has_schedule = sum(1 for kw in schedule_keywords if kw in text_lower) >= 3
    has_drawings = sum(1 for kw in drawing_keywords if kw in text_lower) >= 2

    if has_schedule:
        prompt = _build_extraction_prompt(combined_text, doc_summaries)
    else:
        prompt = _build_generation_prompt(combined_text, doc_summaries)

    api_key = _load_api_key()
    if not api_key:
        print(f"ANTHROPIC_API_KEY not set — skipping AI generation for project {project_id}")
        return

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=16000,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = message.content[0].text.strip()

        start = response_text.find("[")
        end = response_text.rfind("]") + 1
        if start >= 0 and end > start:
            json_str = response_text[start:end]
            activities_data = json.loads(json_str)

            # Replace all activities for this project
            db.query(Activity).filter(Activity.project_id == project_id).delete()
            db.commit()

            for i, act in enumerate(activities_data):
                dur = float(act.get("duration_days", 0) or 0)
                activity = Activity(
                    project_id=project_id,
                    task_id=act.get("task_id", i + 1),
                    name=act.get("name", ""),
                    duration_days=dur,
                    duration_weeks=round(dur / 6, 1),
                    start_date=act.get("start_date"),
                    finish_date=act.get("finish_date"),
                    percent_complete=float(act.get("percent_complete", 0) or 0),
                    resource_names=act.get("resource_names", ""),
                    indent_level=int(act.get("indent_level", 0) or 0),
                    is_summary=bool(act.get("is_summary", False)),
                    is_milestone=bool(act.get("is_milestone", False)),
                    is_critical=bool(act.get("is_critical", False)),
                    sort_order=i,
                )
                db.add(activity)
            db.commit()
            print(f"Generated {len(activities_data)} activities for project {project_id}")

    except Exception as e:
        import traceback
        print(f"AI programme generation error for project {project_id}: {e}\n{traceback.format_exc()}")


def _build_extraction_prompt(text: str, doc_names: list) -> str:
    return f"""You are a construction programme analyst. Extract ALL activities from the following programme document(s) and return them as a JSON array.

Documents analysed: {', '.join(doc_names)}

For each activity, extract:
- task_id: integer ID (from ID/Task ID column, or sequential if not present)
- name: full activity name including area/zone/level prefixes (e.g. "Level 3: Concrete Slab")
- duration_days: working days (integer)
- start_date: DD/MM/YY format
- finish_date: DD/MM/YY format
- percent_complete: 0-100
- resource_names: subcontractor or trade names (comma-separated if multiple)
- indent_level: 0 for top-level summaries, 1 for second level, 2 for third level, etc.
- is_summary: true if this is a summary/header row (bold, ALL CAPS, or has sub-activities)
- is_milestone: true if duration is 0
- is_critical: true if on critical path

Rules:
- Extract EVERY activity — do not skip any
- ALL CAPS names are typically summaries
- Preserve the exact hierarchy as shown in the document
- Include project-level summary as the first row if present
- Return ONLY a valid JSON array — no other text or explanation

[
  {{"task_id": 1, "name": "PROJECT", "duration_days": 500, "start_date": "01/01/25", "finish_date": "31/07/26", "percent_complete": 0, "resource_names": "", "indent_level": 0, "is_summary": true, "is_milestone": false, "is_critical": false}}
]

DOCUMENT TEXT:
{text}"""


def _build_generation_prompt(text: str, doc_names: list) -> str:
    return f"""You are an expert construction planner. Based on the project documents below, create a detailed, comprehensive construction programme.

Documents provided: {', '.join(doc_names)}

Generate a FULL, DETAILED construction programme with ALL of the following sections and their constituent activities. Use the documents to inform:
- The building's zones, levels, and areas
- Specific trades and subcontractors mentioned
- Any programme constraints or milestones
- Scope of works by trade

PROGRAMME STRUCTURE — generate activities at EACH level:

1. PROJECT SUMMARY (indent 0, summary)
2. PRELIMINARIES & SITE ESTABLISHMENT (indent 0, summary)
   - Site mobilisation, hoarding, site offices, temp services, etc.
3. SUBSTRUCTURE (indent 0, summary) — if applicable
   - Demolition, excavation, piling, footings, slab on ground
4. For each BUILDING / WING / ZONE mentioned in the documents:
   - Create a summary row for each zone (indent 0)
   - For each LEVEL within the zone (Basement, Ground, Level 1, Level 2, etc.):
     - Summary row for the level (indent 1)
     - STRUCTURE (indent 2, summary): formwork, reinforcement, concrete pour, strip/cure
     - EXTERNAL ENVELOPE (indent 2, summary): facade, windows, waterproofing, roof
     - MECHANICAL ROUGH-IN (indent 2): ductwork, pipework, plant
     - ELECTRICAL ROUGH-IN (indent 2): containment, cabling, DB
     - HYDRAULICS ROUGH-IN (indent 2): drainage, water services
     - FIRE SERVICES ROUGH-IN (indent 2)
     - INTERNAL PARTITIONS (indent 2): framing, fire-rated walls, wet areas
     - INSULATION & VAPOUR BARRIERS (indent 2)
     - PLASTERBOARD & CEILINGS (indent 2)
     - JOINERY & FITOUT (indent 2)
     - FINISHES — FLOORS (indent 2): tiling, carpet, timber
     - FINISHES — WALLS & CEILINGS (indent 2): painting, feature walls
     - MECHANICAL FIT-OFF (indent 2): grilles, fan coil units
     - ELECTRICAL FIT-OFF (indent 2): GPOs, lights, switches
     - HYDRAULICS FIT-OFF (indent 2): tapware, fixtures
     - FIRE SERVICES FIT-OFF (indent 2)
     - LIFTS / ESCALATORS (indent 2) — if applicable
5. EXTERNAL WORKS (indent 0, summary): landscaping, hardstand, car park, fencing
6. COMMISSIONING & DEFECTS (indent 0, summary)
7. Key MILESTONES: Practical Completion, Handover, etc. (is_milestone: true, duration_days: 0)

For each activity set realistic durations based on scope:
- Simple works: 5-15 days
- Complex trades: 20-60 days per level
- Summary rows: span of all child activities

Use DD/MM/YY date format. Start the programme from approximately today's date.
Assume 6-day working week.
Assign resource_names based on trades mentioned in documents.
Mark critical path items (structure, envelope, key milestones) as is_critical: true.

Return ONLY a valid JSON array with 80-200+ activities. No text before or after the array.

[
  {{"task_id": 1, "name": "PROJECT SUMMARY", "duration_days": 520, "start_date": "01/04/25", "finish_date": "31/10/26", "percent_complete": 0, "resource_names": "", "indent_level": 0, "is_summary": true, "is_milestone": false, "is_critical": false}},
  {{"task_id": 2, "name": "Practical Completion", "duration_days": 0, "start_date": "31/10/26", "finish_date": "31/10/26", "percent_complete": 0, "resource_names": "", "indent_level": 1, "is_summary": false, "is_milestone": true, "is_critical": true}}
]

PROJECT DOCUMENTS:
{text}"""
