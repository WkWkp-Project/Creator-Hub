"""Authentication + user management."""
import json
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import audit, models, schemas
from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..directory_models import Member, member_role_for, user_role_for
from ..ratelimit import allow, clear_failures, failure_count, register_failure
from ..security import create_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOGIN_LIMIT = 10            # attempts ...
LOGIN_WINDOW_SECONDS = 300  # ... per 5 minutes per IP
LOCKOUT_THRESHOLD = 5       # failed logins ...
LOCKOUT_WINDOW = 900        # ... per 15 minutes locks that username (anti credential-stuffing)

GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def _is_admin_email(email: str) -> bool:
    """True if the email's domain matches an auto-admin domain (e.g. wkwkp)."""
    domain = email.rsplit("@", 1)[-1].lower()
    needles = [d.strip().lower() for d in get_settings().admin_email_domains.split(",") if d.strip()]
    # Suffix match at a label boundary — exact domain or a subdomain of it.
    return any(n and (domain == n or domain.endswith("." + n)) for n in needles)


# --- User ⇄ Member consistency -------------------------------------------------
# A login `User` and a directory `Member` describe the same person. We keep them
# in sync (linked by email) so admins manage people in one place and never end up
# with conflicting duplicates. Role vocab differs by table but maps 1:1 via
# member_role_for / user_role_for (defined in directory_models):
#   User:   admin / manager / viewer       Member: admin / manager / customer
def _user_email(user: models.User) -> str:
    """The email that links this login to a Member — explicit email, else an
    email-style username."""
    e = (user.email or "").strip().lower()
    if not e and "@" in (user.username or ""):
        e = user.username.strip().lower()
    return e


def _sync_member_for_user(db: Session, user: models.User) -> None:
    """Mirror a login user into the people directory (Member), linked by email.
    Login accounts without an email (e.g. system 'admin') stay login-only."""
    email = _user_email(user)
    if "@" not in email:
        return
    m = db.query(Member).filter(func.lower(Member.email) == email).first()
    if not m:
        db.add(Member(name=user.full_name or email, email=email,
                      role=member_role_for(user.role),
                      organization=user.organization or "",
                      note=user.note or "เชื่อมจากบัญชีผู้ใช้ (User)"))
    else:
        m.role = member_role_for(user.role)
        if user.full_name and not m.name:
            m.name = user.full_name
        m.organization = user.organization or ""   # keep in lock-step (incl. clears)
        if user.note:
            m.note = user.note


def _verify_google_credential(credential: str) -> dict:
    """Validate a Google ID token via Google's tokeninfo endpoint (stdlib only).

    Returns {email, name, picture}. Raises 401 on any problem. Google only
    returns 200 for a properly-signed, unexpired token, so checking the issuer,
    audience and verified-email here is sufficient without extra crypto deps.
    """
    settings = get_settings()
    url = GOOGLE_TOKENINFO + "?" + urllib.parse.urlencode({"id_token": credential})
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            info = json.loads(resp.read().decode())
    except Exception:
        raise HTTPException(401, "ตรวจสอบ Google token ไม่สำเร็จ")
    if info.get("iss") not in GOOGLE_ISSUERS:
        raise HTTPException(401, "Google token issuer ไม่ถูกต้อง")
    if settings.google_client_id and info.get("aud") != settings.google_client_id:
        raise HTTPException(401, "Google client id ไม่ตรงกับที่ตั้งค่าไว้")
    if str(info.get("email_verified")).lower() != "true":
        raise HTTPException(401, "อีเมล Google ยังไม่ได้ยืนยัน")
    email = (info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "ไม่พบอีเมลใน Google token")
    return {"email": email, "name": (info.get("name") or email.split("@")[0]).strip()}


@router.post("/login", response_model=schemas.LoginResponse)
def login(data: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not allow(f"login:{client_ip}", limit=LOGIN_LIMIT, window_seconds=LOGIN_WINDOW_SECONDS):
        raise HTTPException(429, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่")
    acct = f"acct:{data.username.strip().lower()}"
    if failure_count(acct, window_seconds=LOCKOUT_WINDOW) >= LOCKOUT_THRESHOLD:
        raise HTTPException(429, "บัญชีนี้ถูกล็อกชั่วคราวจากการพยายามเข้าสู่ระบบผิดหลายครั้ง — รอสักครู่แล้วลองใหม่")
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        register_failure(acct, window_seconds=LOCKOUT_WINDOW)
        raise HTTPException(401, "Invalid username or password")
    clear_failures(acct)   # successful login resets the lockout counter
    token = create_token(username=user.username, role=user.role, token_version=user.token_version or 0)
    audit.record(db, entity="auth", action="login", user=user, summary="เข้าสู่ระบบ")
    db.commit()
    return {"token": token, "user": user}


@router.get("/config")
def auth_config():
    """Public auth config for the frontend (e.g. whether Google login is on)."""
    return {"google_client_id": get_settings().google_client_id}


@router.post("/google", response_model=schemas.LoginResponse)
def google_login(data: schemas.GoogleLoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not allow(f"glogin:{client_ip}", limit=LOGIN_LIMIT, window_seconds=LOGIN_WINDOW_SECONDS):
        raise HTTPException(429, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่")

    info = _verify_google_credential(data.credential)
    email, name = info["email"], info["name"]
    is_admin = _is_admin_email(email)

    # Upsert the auth user (username = email; no usable password for Google accounts).
    user = db.query(models.User).filter(models.User.username == email).first()
    if not user:
        user = models.User(
            username=email, email=email, full_name=name,
            role="admin" if is_admin else "viewer",
            password_hash="google-oauth",   # not a valid PBKDF2 hash → password login disabled
        )
        db.add(user)
    else:
        if not user.email:
            user.email = email
        if is_admin and user.role != "admin":
            user.role = "admin"             # wkwkp emails are always admin
        if not user.full_name and name:
            user.full_name = name

    # Link the Google identity onto a Member record (auto-create basic data).
    member = db.query(Member).filter(func.lower(Member.email) == email).first()
    if not member:
        member = Member(
            name=name or email, email=email,
            role="admin" if is_admin else "customer",
            note="สร้างอัตโนมัติจากการเข้าสู่ระบบด้วย Google",
        )
        db.add(member)
    else:
        if is_admin and member.role != "admin":
            member.role = "admin"
        if not member.name and name:
            member.name = name

    db.commit()
    db.refresh(user)
    token = create_token(username=user.username, role=user.role, token_version=user.token_version or 0)
    audit.record(db, entity="auth", action="login", user=user, summary="เข้าสู่ระบบด้วย Google")
    db.commit()
    return {"token": token, "user": user}


@router.post("/reconcile-members")
def reconcile_members(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    """One-time alignment: ensure every login user that has an email also has a
    matching directory Member (role-mapped). Login accounts without an email
    (system logins) are skipped. Safe to run repeatedly."""
    members_created = users_created = skipped = 0
    # 1) every login user with an email → ensure a directory Member
    for user in db.query(models.User).all():
        email = _user_email(user)
        if "@" not in email:
            skipped += 1
            continue
        if not user.email:           # backfill the user's email from an email-style username
            user.email = email
        m = db.query(Member).filter(func.lower(Member.email) == email).first()
        want = member_role_for(user.role)
        if not m:
            db.add(Member(name=user.full_name or email, email=email, role=want, note="เชื่อมจากบัญชีผู้ใช้ (User)"))
            members_created += 1
        else:
            m.role = want
            if user.full_name and not m.name:
                m.name = user.full_name
    db.flush()
    # 2) every directory Member with an email → ensure a login account (no password;
    #    they sign in with Google or an admin sets a password later)
    for mem in db.query(Member).all():
        e = (mem.email or "").strip().lower()
        if "@" not in e or len(e) > 80:
            continue
        role = user_role_for(mem.role)
        u = db.query(models.User).filter(
            (func.lower(models.User.email) == e) | (func.lower(models.User.username) == e)
        ).first()
        if not u:
            db.add(models.User(username=e, email=e, full_name=mem.name or e, role=role, password_hash="google-oauth"))
            users_created += 1
        else:
            u.role = role
            if not u.email:
                u.email = e
    db.commit()
    return {"members_created": members_created, "users_created": users_created, "skipped_no_email": skipped}


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
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(400, "Username already exists")
    user = models.User(
        username=data.username,
        email=(data.email.strip() or (data.username if "@" in data.username else "")),
        full_name=data.full_name,
        role=data.role,
        organization=data.organization,
        position=data.position,
        note=data.note,
        directory_access=data.directory_access,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    _sync_member_for_user(db, user)   # keep the people directory in sync
    db.flush()
    audit.record(db, entity="user", entity_id=user.id, user=admin, action="created",
                 summary=f"สร้างผู้ใช้: {user.username} (role={user.role})")
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
    # Guard against removing the last admin — any demotion away from admin
    # (to manager or viewer) must be blocked when this is the only admin left.
    new_role = changes.get("role")
    if new_role and new_role != "admin" and user.role == "admin" and \
            db.query(models.User).filter(models.User.role == "admin").count() <= 1:
        raise HTTPException(400, "Cannot demote the last admin")
    old_role = user.role
    for key, value in changes.items():
        setattr(user, key, value)
    _sync_member_for_user(db, user)   # propagate name/role changes to the directory
    detail = ({"role": {"from": old_role, "to": user.role}}
              if new_role and old_role != user.role else None)
    audit.record(db, entity="user", entity_id=user.id, user=admin, action="updated",
                 summary=f"แก้ไขผู้ใช้: {user.username} ({', '.join(sorted(changes))})", detail=detail)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/password", status_code=204)
def reset_user_password(
    user_id: int,
    data: schemas.PasswordChange,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.password_hash = hash_password(data.new_password)
    user.token_version = (user.token_version or 0) + 1   # force re-login (offboard / reset)
    audit.record(db, entity="user", entity_id=user.id, user=admin,
                 action="password_reset", summary=f"รีเซ็ตรหัสผ่าน + บังคับออกจากระบบ: {user.username}")
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
    user.token_version = (user.token_version or 0) + 1   # revoke other sessions
    audit.record(db, entity="user", entity_id=user.id, user=user,
                 action="password_change", summary="เปลี่ยนรหัสผ่านตนเอง")
    db.commit()


@router.post("/logout", status_code=204)
def logout(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke every outstanding token for the caller (all devices)."""
    user.token_version = (user.token_version or 0) + 1
    audit.record(db, entity="auth", action="logout", user=user, summary="ออกจากระบบ (เพิกถอนทุก session)")
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
    # Scrub this user's id from every campaign access grant so a future user that
    # reuses the same id can never silently inherit the old grants.
    from ..content_asset_models import ContentAsset
    for a in db.query(ContentAsset).filter(ContentAsset.assigned_user_ids.isnot(None)).all():
        if user.id in (a.assigned_user_ids or []):
            a.assigned_user_ids = [x for x in a.assigned_user_ids if x != user.id]
    audit.record(db, entity="user", entity_id=user.id, user=admin, action="deleted",
                 summary=f"ลบผู้ใช้: {user.username} ({user.role})")
    db.delete(user)
    db.commit()
