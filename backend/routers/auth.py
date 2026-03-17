"""
Magic-link email authentication.
- POST /api/auth/request  → creates a token, prints link to stdout (upgrade to real email later)
- POST /api/auth/verify   → verifies token, returns JWT session token
- GET  /api/auth/me       → returns current user from Bearer JWT
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from jose import jwt, JWTError
import secrets
import os

from database import get_db, User, MagicToken

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── JWT config ──────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-in-production-12345")
ALGORITHM = "HS256"
SESSION_EXPIRE_DAYS = 30
MAGIC_TOKEN_EXPIRE_MINUTES = 15


def _create_jwt(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=SESSION_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode_jwt(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ── Dependency: get current user from Bearer token ───────────────────────
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        payload = _decode_jwt(credentials.credentials)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


# ── Schemas ──────────────────────────────────────────────────────────────
class RequestLinkBody(BaseModel):
    email: str   # not using EmailStr to keep deps minimal


class VerifyBody(BaseModel):
    token: str


# ── Routes ───────────────────────────────────────────────────────────────
@router.post("/request")
def request_magic_link(body: RequestLinkBody, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    # Create/get user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Generate token
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(minutes=MAGIC_TOKEN_EXPIRE_MINUTES)
    magic = MagicToken(token=token, email=email, expires_at=expires)
    db.add(magic)
    db.commit()

    # In production, send via email. For now, print to console.
    link = f"http://localhost:5173/auth/verify?token={token}"
    print(f"\n{'='*60}")
    print(f"  MAGIC LINK for {email}")
    print(f"  {link}")
    print(f"  (expires in {MAGIC_TOKEN_EXPIRE_MINUTES} minutes)")
    print(f"{'='*60}\n")

    return {"message": "Magic link sent", "dev_token": token}  # dev_token removed in production


@router.post("/verify")
def verify_magic_link(body: VerifyBody, db: Session = Depends(get_db)):
    record = db.query(MagicToken).filter(MagicToken.token == body.token).first()
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    if record.used:
        raise HTTPException(status_code=400, detail="This link has already been used")
    if datetime.utcnow() > record.expires_at:
        raise HTTPException(status_code=400, detail="This link has expired. Request a new one.")

    # Mark used
    record.used = True
    db.commit()

    # Get/create user
    user = db.query(User).filter(User.email == record.email).first()
    if not user:
        user = User(email=record.email)
        db.add(user)
        db.commit()
        db.refresh(user)

    session_token = _create_jwt(user.id, user.email)
    return {
        "token": session_token,
        "user": {"id": user.id, "email": user.email},
    }


@router.get("/me")
def get_me(user: User = Depends(require_user)):
    return {"id": user.id, "email": user.email}


@router.post("/login")
def login(body: RequestLinkBody, db: Session = Depends(get_db)):
    """Simple email-only login — no verification step required."""
    email = body.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = _create_jwt(user.id, user.email)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email},
    }


@router.post("/logout")
def logout():
    # JWT is stateless — client just deletes the token
    return {"message": "Logged out"}
