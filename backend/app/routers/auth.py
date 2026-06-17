"""Authentication + user management."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..ratelimit import allow
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOGIN_LIMIT = 10            # attempts ...
LOGIN_WINDOW_SECONDS = 300  # ... per 5 minutes per IP


@router.post("/login", response_model=schemas.LoginResponse)
def login(data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not allow(f"login:{client_ip}", limit=LOGIN_LIMIT, window_seconds=LOGIN_WINDOW_SECONDS):
        raise HTTPException(429, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่")
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    token = create_token(username=user.username, role=user.role)
    return {"token": token, "user": user}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


# ---------- user management (admin only) ----------

@router.get("/users", response_model=list[schemas.UserOut])
def list_users(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.username).all()


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    data: schemas.UserCreate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(400, "Username already exists")
    user = models.User(
        username=data.username,
        full_name=data.full_name,
        role=data.role,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    changes = data.model_dump(exclude_unset=True)
    # Guard against removing the last admin.
    if changes.get("role") == "viewer" and user.role == "admin" and \
            db.query(models.User).filter(models.User.role == "admin").count() <= 1:
        raise HTTPException(400, "Cannot demote the last admin")
    for key, value in changes.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/password", status_code=204)
def reset_user_password(
    user_id: int,
    data: schemas.PasswordChange,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.password_hash = hash_password(data.new_password)
    db.commit()


@router.put("/password", status_code=204)
def change_own_password(
    data: schemas.PasswordChange,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not data.current_password or not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    db.commit()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    if user.role == "admin" and db.query(models.User).filter(models.User.role == "admin").count() <= 1:
        raise HTTPException(400, "Cannot delete the last admin")
    db.delete(user)
    db.commit()
