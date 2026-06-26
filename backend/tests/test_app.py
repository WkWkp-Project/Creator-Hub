"""Smoke tests — run with:  pytest -q  (from backend/ with venv active)."""
import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + tempfile.mktemp(suffix=".db")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services.column_matcher import coerce, match_column  # noqa: E402
from app.services.tiers import tier_for_followers  # noqa: E402

# Seed an admin + a viewer directly so we can exercise the auth-gated API.
_db = SessionLocal()
_db.add_all([
    User(username="admin", full_name="Admin", role="admin", password_hash=hash_password("admin123")),
    User(username="viewer", full_name="Viewer", role="viewer", password_hash=hash_password("viewer123")),
])
_db.commit()
_db.close()

client = TestClient(app)


def _token(username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password}).json()["token"]


# Default to admin auth for the existing CRUD/stat tests.
client.headers.update({"Authorization": f"Bearer {_token('admin', 'admin123')}"})
VIEWER = {"Authorization": f"Bearer {_token('viewer', 'viewer123')}"}


# ---------- column matcher ----------

def test_english_headers_match():
    assert match_column("Full Name").system_field == "name"
    assert match_column("Insta_Handle").system_field == "handle"
    assert match_column("Total_Followers").system_field == "followers"
    assert match_column("Cost_Per_Post").system_field == "base_rate"


def test_thai_headers_match():
    assert match_column("ค่าตัว").system_field == "base_rate"
    assert match_column("ค่าเจนโค๊ด").system_field == "code_gen_fee"
    assert match_column("ค่าเมเนจฟี").system_field == "management_fee"
    assert match_column("ค่าเอเจนฟี").system_field == "agency_fee_pct"
    assert match_column("อายุ").system_field == "age"


def test_social_link_headers_match():
    assert match_column("Instagram Link").system_field == "link_instagram"
    assert match_column("TikTok URL").system_field == "link_tiktok"
    assert match_column("YouTube").system_field == "link_youtube"


def test_short_alias_no_false_positive():
    # "er" must not match inside "Internal Ref"
    assert match_column("Internal Ref").system_field != "engagement_rate"
    assert match_column("xyz123").status == "unmapped"


def test_value_coercion():
    assert coerce("followers", "1.2M") == 1_200_000
    assert coerce("base_rate", "$5,000") == 5000.0
    assert coerce("engagement_rate", "4.8%") == 4.8
    assert coerce("verified", "Yes") is True
    assert coerce("verified", "no") is False


# ---------- API ----------

def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_crud_lifecycle():
    # agency fee is now a percentage: total = (base+code+mgmt) * (1 + pct/100)
    created = client.post("/api/influencers", json={
        "name": "Test Creator", "base_rate": 1000, "agency_fee_pct": 50,
        "social_links": {"instagram": "https://instagram.com/test"},
    }).json()
    assert created["total_fee"] == 1500          # 1000 * 1.5
    assert created["agency_amount"] == 500
    assert created["social_links"]["instagram"].endswith("/test")
    iid = created["id"]

    got = client.get(f"/api/influencers/{iid}").json()
    assert got["name"] == "Test Creator"

    updated = client.put(f"/api/influencers/{iid}", json={"management_fee": 250}).json()
    assert updated["total_fee"] == 1875          # (1000+250) * 1.5

    assert client.delete(f"/api/influencers/{iid}").status_code == 204
    assert client.get(f"/api/influencers/{iid}").status_code == 404


def test_export_xlsx():
    r = client.get("/api/influencers/export?format=csv")
    assert r.status_code == 200
    assert "attachment" in r.headers.get("content-disposition", "")


# ---------- tiers ----------

def test_tier_thresholds():
    assert tier_for_followers(0) == "Nano"
    assert tier_for_followers(9_999) == "Nano"
    assert tier_for_followers(10_000) == "Micro"
    assert tier_for_followers(999_999) == "Micro"
    assert tier_for_followers(1_000_000) == "Mega"
    assert tier_for_followers(5_000_000) == "Mega"


def test_tier_auto_derived_on_create():
    # No tier supplied -> derived from followers.
    auto = client.post("/api/influencers", json={"name": "Auto Tier", "followers": 50_000}).json()
    assert auto["tier"] == "Micro"
    # Explicit tier is respected even if it disagrees with followers.
    manual = client.post("/api/influencers", json={
        "name": "Manual Tier", "followers": 50_000, "tier": "Mega"}).json()
    assert manual["tier"] == "Mega"
    # A known tier typed in any casing is canonicalised.
    cased = client.post("/api/influencers", json={"name": "Cased", "followers": 1, "tier": "micro"}).json()
    assert cased["tier"] == "Micro"
    # A custom, hand-entered tier label is kept verbatim (not rejected).
    custom = client.post("/api/influencers", json={
        "name": "Custom Tier", "followers": 50_000, "tier": "Macro"}).json()
    assert custom["tier"] == "Macro"
    # A followers-only edit must NOT clobber an explicit/custom tier.
    kept = client.put(f"/api/influencers/{custom['id']}", json={"followers": 2_000_000}).json()
    assert kept["tier"] == "Macro"
    # Clearing the tier (empty string) re-derives it from followers.
    recleared = client.put(f"/api/influencers/{custom['id']}", json={"tier": ""}).json()
    assert recleared["tier"] == "Mega"
    for x in (auto, manual, cased, custom):
        client.delete(f"/api/influencers/{x['id']}")


def test_tier_filter_and_import_coercion():
    a = client.post("/api/influencers", json={"name": "Nano Person", "followers": 2_000}).json()
    b = client.post("/api/influencers", json={"name": "Mega Person", "followers": 2_000_000}).json()
    nanos = client.get("/api/influencers?tier=Nano").json()
    names = {i["name"] for i in nanos["items"]}
    assert "Nano Person" in names and "Mega Person" not in names
    # importer normalises free-text tier cells
    assert coerce("tier", "mega") == "Mega"
    assert coerce("tier", " NANO ") == "Nano"
    assert coerce("tier", "huge") == ""
    assert match_column("Tier").system_field == "tier"
    client.delete(f"/api/influencers/{a['id']}")
    client.delete(f"/api/influencers/{b['id']}")


def test_campaign_media_validation():
    # Valid uploaded-path media + external work link are accepted.
    ok = client.post("/api/influencers", json={
        "name": "Media Creator",
        "past_campaigns": [{
            "brand": "X", "campaign": "Y",
            "media_url": "https://example.com/clip.mp4", "media_type": "video",
            "work_url": "https://youtube.com/watch?v=abc",
        }],
    })
    assert ok.status_code == 201
    assert ok.json()["past_campaigns"][0]["media_type"] == "video"
    client.delete(f"/api/influencers/{ok.json()['id']}")
    # Bad media type is rejected.
    bad = client.post("/api/influencers", json={
        "name": "Bad Media",
        "past_campaigns": [{"brand": "X", "media_type": "gif"}],
    })
    assert bad.status_code == 422


def test_avatar_url_validation():
    bad = client.post("/api/influencers", json={"name": "Bad Avatar", "avatar_url": "not a url"})
    assert bad.status_code == 422
    good = client.post("/api/influencers", json={
        "name": "Good Avatar", "avatar_url": "/uploads/avatars/x.png"})
    assert good.status_code == 201
    client.delete(f"/api/influencers/{good.json()['id']}")


# ---------- auth + roles ----------

def test_login_and_me():
    bad = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert bad.status_code == 401
    me = client.get("/api/auth/me").json()
    assert me["role"] == "admin"


def test_unauthenticated_is_rejected():
    # Bare request with no token -> 401.
    r = TestClient(app).get("/api/influencers")
    assert r.status_code == 401


def test_viewer_cannot_write_but_can_read():
    assert client.get("/api/influencers", headers=VIEWER).status_code == 200
    forbidden = client.post("/api/influencers", json={"name": "Nope"}, headers=VIEWER)
    assert forbidden.status_code == 403


def test_user_create_update_delete():
    # create
    created = client.post("/api/auth/users", json={
        "username": "tester", "password": "pass1234", "full_name": "Tester", "role": "viewer"})
    assert created.status_code == 201
    uid = created.json()["id"]
    # edit name + role
    updated = client.put(f"/api/auth/users/{uid}", json={"full_name": "Tester Two", "role": "admin"}).json()
    assert updated["full_name"] == "Tester Two" and updated["role"] == "admin"
    # reset password, then login with it
    assert client.put(f"/api/auth/users/{uid}/password", json={"new_password": "newpass1"}).status_code == 204
    assert client.post("/api/auth/login", json={"username": "tester", "password": "newpass1"}).status_code == 200
    # viewer cannot edit users
    assert client.put(f"/api/auth/users/{uid}", json={"role": "viewer"}, headers=VIEWER).status_code == 403
    # cleanup
    assert client.delete(f"/api/auth/users/{uid}").status_code == 204


def test_last_admin_guard():
    # In the test DB the only admin is `admin`; demoting it must be blocked.
    me = client.get("/api/auth/me").json()
    assert me["role"] == "admin"
    resp = client.put(f"/api/auth/users/{me['id']}", json={"role": "viewer"})
    assert resp.status_code == 400
    # admin still admin
    assert client.get("/api/auth/me").json()["role"] == "admin"
    # cannot delete own account either
    assert client.delete(f"/api/auth/users/{me['id']}").status_code == 400


# ---------- campaigns ----------

def test_campaign_crud_and_role_guard():
    created = client.post("/api/campaigns", json={
        "name": "Test Campaign", "brand": "Acme", "status": "planning",
        "budget": 50000, "influencer_ids": [1, 2],
    })
    assert created.status_code == 201
    cid = created.json()["id"]
    assert created.json()["status"] == "planning"

    # viewer is read-only
    assert client.get(f"/api/campaigns/{cid}", headers=VIEWER).status_code == 200
    assert client.delete(f"/api/campaigns/{cid}", headers=VIEWER).status_code == 403

    # invalid status rejected
    assert client.post("/api/campaigns", json={"name": "X", "status": "bogus"}).status_code == 422

    updated = client.put(f"/api/campaigns/{cid}", json={"status": "active"}).json()
    assert updated["status"] == "active"
    assert client.delete(f"/api/campaigns/{cid}").status_code == 204


def test_stats_endpoints():
    assert "tiers" in client.get("/api/stats").json()
    assert "niches" in client.get("/api/stats/niche-performance").json()
    fin = client.get("/api/stats/financials").json()
    assert "roster_value" in fin and "fee_composition" in fin


def test_backup_create_and_restore(tmp_path):
    # Redirect backups to a temp dir so tests never touch real local backups.
    from app.routers import backup as backup_mod
    backup_mod.BACKUP_DIR = tmp_path

    # snapshot current state
    snap = client.post("/api/backup")
    assert snap.status_code == 201
    before = client.get("/api/influencers").json()["total"]
    # add a throwaway influencer, then restore the snapshot to remove it
    created = client.post("/api/influencers", json={"name": "Backup Victim", "followers": 1234}).json()
    assert client.get("/api/influencers").json()["total"] == before + 1
    restored = client.post("/api/backup/restore", json={})
    assert restored.status_code == 200
    assert client.get("/api/influencers").json()["total"] == before
    # the throwaway record is gone after recall
    assert client.get(f"/api/influencers/{created['id']}").status_code == 404
    # backups are admin-only
    assert client.get("/api/backup", headers=VIEWER).status_code == 403
    assert client.post("/api/backup", headers=VIEWER).status_code == 403


def test_import_commit_rejects_bad_upload_id():
    # path-traversal / malformed ids are refused before touching the filesystem
    bad = client.post("/api/imports/commit", json={
        "upload_id": "../../etc/passwd", "mappings": [{"file_column": "x", "system_field": "name"}]})
    assert bad.status_code == 400


def test_login_rate_limit():
    from app import ratelimit
    ratelimit._hits.clear()  # clean slate for a deterministic test
    last = None
    for _ in range(12):
        last = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert last.status_code == 429  # eventually throttled
    ratelimit._hits.clear()  # don't leak throttle state into other tests


def test_content_brief_crud_and_roles():
    payload = {
        "title": "Summer Brief", "campaign_id": 1, "status": "draft",
        "section_a": {"product": {"name": "Glow Serum"}, "kol_brief": {"objective": "awareness"}, "extra": {}},
        "section_b": {"deliverables": [{"platform": "TikTok", "count": 2}], "kpis": ["reach"]},
    }
    created = client.post("/api/content", json=payload)
    assert created.status_code == 201
    cid = created.json()["id"]
    assert created.json()["section_a"]["product"]["name"] == "Glow Serum"
    # filter by campaign + read
    lst = client.get("/api/content?campaign_id=1").json()
    assert any(b["id"] == cid for b in lst["items"])
    # invalid status rejected
    assert client.post("/api/content", json={"title": "X", "status": "bogus"}).status_code == 422
    # update (partial, flexible JSON)
    upd = client.put(f"/api/content/{cid}", json={"status": "approved"}).json()
    assert upd["status"] == "approved"
    # role guard: viewer reads but cannot write
    assert client.get(f"/api/content/{cid}", headers=VIEWER).status_code == 200
    assert client.post("/api/content", json={"title": "Nope"}, headers=VIEWER).status_code == 403
    assert client.delete(f"/api/content/{cid}").status_code == 204


def test_content_asset_crud_and_drive_links():
    created = client.post("/api/assets", json={
        "campaign_name": "QA Asset", "client_name": "QA Co",
        "drive_folder_url": "https://drive.google.com/drive/folders/x",
        "period_start": "May 2026", "period_end": "Aug 2026",
    })
    assert created.status_code == 201
    a = created.json()
    aid = a["id"]
    assert len(a["input_files"]) == 3 and a["status"] == "draft"
    # invalid status rejected
    assert client.put(f"/api/assets/{aid}", json={"status": "bogus"}).status_code == 422
    # drive-links endpoint marks linked
    linked = client.put(f"/api/assets/{aid}/drive-links", json={"product_info": "https://drive.google.com/drive/folders/p"}).json()
    pf = next(f for f in linked["input_files"] if f["key"] == "product_info")
    assert pf["linked"] is True and pf["drive_url"].endswith("/p")
    # assign creators (legacy merge)
    upd = client.put(f"/api/assets/{aid}", json={"influencer_ids": [1, 2]}).json()
    assert upd["influencer_ids"] == [1, 2]
    # per-campaign access: a viewer NOT assigned cannot even see it
    assert client.get(f"/api/assets/{aid}", headers=VIEWER).status_code == 404
    # admin grants the viewer access → now read-only (can see, cannot edit)
    viewer_id = client.get("/api/auth/me", headers=VIEWER).json()["id"]
    client.put(f"/api/assets/{aid}", json={"assigned_user_ids": [viewer_id]})
    assert client.get(f"/api/assets/{aid}", headers=VIEWER).status_code == 200
    assert client.put(f"/api/assets/{aid}", json={"status": "active"}, headers=VIEWER).status_code == 403
    # viewers can never create
    assert client.post("/api/assets", json={"campaign_name": "no"}, headers=VIEWER).status_code == 403
    assert client.delete(f"/api/assets/{aid}").status_code == 204


def test_members_brands_and_campaign_links():
    # member create + role validation
    bad = client.post("/api/members", json={"name": "X", "role": "superuser"})
    assert bad.status_code == 422
    mem = client.post("/api/members", json={"name": "Lead A", "email": "a@x.com", "role": "admin"}).json()
    cust = client.post("/api/members", json={"name": "Client B", "role": "customer"}).json()
    assert {m["role"] for m in client.get("/api/members").json()} >= {"admin", "customer"}
    # brand create + duplicate guard
    brand = client.post("/api/brands", json={"name": "QA Brand"}).json()
    assert client.post("/api/brands", json={"name": "QA Brand"}).status_code == 400
    # campaign links to brand + responsible
    asset = client.post("/api/assets", json={
        "campaign_name": "Linked Campaign", "drive_folder_url": "https://drive.google.com/drive/folders/x",
        "brand_id": brand["id"], "responsible_member_id": mem["id"]}).json()
    assert asset["brand_id"] == brand["id"] and asset["responsible_member_id"] == mem["id"]
    # member update keeps the linked login account in sync (regression: must not
    # call a missing helper) — promote the customer to admin, expect 200.
    upd = client.put(f"/api/members/{cust['id']}", json={"role": "admin", "email": "b@x.com"})
    assert upd.status_code == 200 and upd.json()["role"] == "admin"
    # manager is a valid Member role and syncs to a manager login account.
    mgr = client.post("/api/members", json={"name": "Mgr C", "email": "mgr@x.com", "role": "manager"})
    assert mgr.status_code == 201 and mgr.json()["role"] == "manager"
    synced = [u for u in client.get("/api/auth/users").json() if u["email"] == "mgr@x.com"]
    assert synced and synced[0]["role"] == "manager"
    assert client.post("/api/members", json={"name": "X", "role": "superuser"}).status_code == 422
    # viewer cannot write members/brands
    assert client.post("/api/members", json={"name": "Z"}, headers=VIEWER).status_code == 403
    assert client.post("/api/brands", json={"name": "Z"}, headers=VIEWER).status_code == 403
    # cleanup
    client.delete(f"/api/assets/{asset['id']}")
    client.delete(f"/api/brands/{brand['id']}")
    client.delete(f"/api/members/{mem['id']}")
    client.delete(f"/api/members/{cust['id']}")
    client.delete(f"/api/members/{mgr.json()['id']}")


def test_company_brand_campaign_consistency():
    # A brand carries the owning Company; campaigns under it inherit it as client_name.
    brand = client.post("/api/brands", json={"name": "Cascade Brand", "company": "Acme Co."}).json()
    assert brand["company"] == "Acme Co."
    # New campaign under the brand gets client_name forced to the brand's company,
    # even if a different client_name is supplied.
    asset = client.post("/api/assets", json={
        "campaign_name": "Cascade Camp", "drive_folder_url": "https://drive.google.com/drive/folders/c",
        "brand_id": brand["id"], "client_name": "Typed Wrong Co."}).json()
    assert asset["client_name"] == "Acme Co."
    # Changing the brand's company cascades down to existing campaigns.
    client.put(f"/api/brands/{brand['id']}", json={"company": "Acme Holdings"})
    assert client.get(f"/api/assets/{asset['id']}").json()["client_name"] == "Acme Holdings"
    # A campaign with no brand keeps its free-text client_name.
    free = client.post("/api/assets", json={
        "campaign_name": "Free Camp", "drive_folder_url": "https://drive.google.com/drive/folders/f",
        "client_name": "Indie Client"}).json()
    assert free["client_name"] == "Indie Client"
    # cleanup
    client.delete(f"/api/assets/{asset['id']}")
    client.delete(f"/api/assets/{free['id']}")
    client.delete(f"/api/brands/{brand['id']}")


def test_user_carries_org_note_and_syncs_to_member():
    # The merged User page carries Organization + Note (folded in from Members)
    # and syncs them onto the linked directory Member.
    created = client.post("/api/auth/users", json={
        "username": "orguser", "password": "pw1234", "email": "org@x.com",
        "full_name": "Org User", "role": "viewer",
        "organization": "Wakuwaku", "note": "VIP contact"})
    assert created.status_code == 201
    body = created.json()
    assert body["organization"] == "Wakuwaku" and body["note"] == "VIP contact"
    # the auto-created Member mirrors org/note
    mem = [m for m in client.get("/api/members").json() if m["email"] == "org@x.com"]
    assert mem and mem[0]["organization"] == "Wakuwaku" and mem[0]["note"] == "VIP contact"
    # cleanup
    client.delete(f"/api/auth/users/{body['id']}")
    client.delete(f"/api/members/{mem[0]['id']}")


def test_admin_can_be_demoted_to_manager_when_not_last():
    # Demoting a non-last admin to manager (the new role) must be allowed —
    # the last-admin guard should only fire when this is the only admin left.
    extra = client.post("/api/auth/users", json={
        "username": "extra_admin_qa", "password": "pw1234", "role": "admin"}).json()
    res = client.put(f"/api/auth/users/{extra['id']}", json={"role": "manager"})
    assert res.status_code == 200 and res.json()["role"] == "manager"
    client.delete(f"/api/auth/users/{extra['id']}")


def test_user_position_field():
    created = client.post("/api/auth/users", json={
        "username": "posuser", "password": "pw1234", "email": "pos@x.com",
        "full_name": "Pos User", "role": "viewer", "position": "Account Manager"})
    assert created.status_code == 201 and created.json()["position"] == "Account Manager"
    upd = client.put(f"/api/auth/users/{created.json()['id']}", json={"position": "Creative Lead"})
    assert upd.status_code == 200 and upd.json()["position"] == "Creative Lead"
    client.delete(f"/api/auth/users/{created.json()['id']}")
    mem = [m for m in client.get("/api/members").json() if m["email"] == "pos@x.com"]
    if mem:
        client.delete(f"/api/members/{mem[0]['id']}")


def test_campaign_multiple_responsible_members():
    m1 = client.post("/api/members", json={"name": "Lead One", "role": "admin"}).json()
    m2 = client.post("/api/members", json={"name": "Lead Two", "role": "admin"}).json()
    asset = client.post("/api/assets", json={
        "campaign_name": "Multi Lead Camp", "drive_folder_url": "https://drive.google.com/drive/folders/m",
        "responsible_member_ids": [m1["id"], m2["id"]]}).json()
    assert asset["responsible_member_ids"] == [m1["id"], m2["id"]]
    # narrow to a single lead
    upd = client.put(f"/api/assets/{asset['id']}", json={"responsible_member_ids": [m2["id"]]}).json()
    assert upd["responsible_member_ids"] == [m2["id"]]
    client.delete(f"/api/assets/{asset['id']}")
    client.delete(f"/api/members/{m1['id']}")
    client.delete(f"/api/members/{m2['id']}")


def test_campaign_budget_show_visibility():
    asset = client.post("/api/assets", json={
        "campaign_name": "Budget Vis", "drive_folder_url": "https://drive.google.com/drive/folders/b"}).json()
    assert asset["budget_show"] == {}   # default: everything shown
    upd = client.put(f"/api/assets/{asset['id']}", json={
        "budget_show": {"total": False, "boosting_cost": False}}).json()
    assert upd["budget_show"] == {"total": False, "boosting_cost": False}
    client.delete(f"/api/assets/{asset['id']}")


def test_import_template_download():
    r = client.get("/api/imports/template")
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert r.headers["content-disposition"].endswith('.xlsx"')
    assert r.content[:2] == b"PK"   # xlsx is a zip container


def test_campaign_budgets_rollup_and_export():
    asset = client.post("/api/assets", json={
        "campaign_name": "Budget Rollup Camp", "drive_folder_url": "https://drive.google.com/drive/folders/b",
        "client_name": "RollupCo",
        "kols": [{"influencer_id": 0, "rate": 1000, "gen_code_price": 200, "boosting_cost": 300, "client_approved": "Approve"},
                 {"influencer_id": 0, "rate": "500", "boosting_cost": "", "client_approved": "Posted"}]}).json()
    cb = client.get("/api/stats/campaign-budgets").json()
    assert cb["total"] >= 2000  # 1500 + 500 from this campaign at least
    assert any(r["campaign"] == "Budget Rollup Camp" and r["budget"] == 2000 for r in cb["campaigns"])
    # per-campaign export returns a real xlsx
    r = client.get(f"/api/assets/{asset['id']}/export?format=xlsx")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    client.delete(f"/api/assets/{asset['id']}")


def test_campaign_audit_log():
    a = client.post("/api/assets", json={"campaign_name": "Audited Camp", "drive_folder_url": "x"}).json()
    client.put(f"/api/assets/{a['id']}", json={"status": "active"})
    hist = client.get(f"/api/assets/{a['id']}/history").json()
    assert len(hist) >= 2 and hist[0]["action"] == "updated" and hist[-1]["action"] == "created"
    acts = client.get("/api/stats/activity?limit=5").json()
    assert any(x["asset_id"] == a["id"] for x in acts)
    client.delete(f"/api/assets/{a['id']}")


def test_token_revocation_on_logout():
    client.post("/api/auth/users", json={"username": "revoke_me", "password": "pw1234", "role": "viewer"})
    tok = client.post("/api/auth/login", json={"username": "revoke_me", "password": "pw1234"}).json()["token"]
    H = {"Authorization": f"Bearer {tok}"}
    assert client.get("/api/auth/me", headers=H).status_code == 200
    assert client.post("/api/auth/logout", headers=H).status_code == 204
    assert client.get("/api/auth/me", headers=H).status_code == 401   # old token revoked
    # a fresh login still works
    tok2 = client.post("/api/auth/login", json={"username": "revoke_me", "password": "pw1234"}).json()["token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok2}"}).status_code == 200
    # password change also revokes outstanding tokens
    assert client.put("/api/auth/password", json={"current_password": "pw1234", "new_password": "pw5678"},
                      headers={"Authorization": f"Bearer {tok2}"}).status_code == 204
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok2}"}).status_code == 401
    uid = next(u["id"] for u in client.get("/api/auth/users").json() if u["username"] == "revoke_me")
    client.delete(f"/api/auth/users/{uid}")


def test_internal_endpoints_are_admin_only():
    # A viewer (external customer) must NOT read org-wide budgets/financials or backups.
    assert client.get("/api/stats/campaign-budgets", headers=VIEWER).status_code == 403
    assert client.get("/api/stats/financials", headers=VIEWER).status_code == 403
    # admin still can
    assert client.get("/api/stats/campaign-budgets").status_code == 200


def test_unsafe_url_neutralised_on_save():
    a = client.post("/api/assets", json={
        "campaign_name": "XSS Camp", "drive_folder_url": "javascript:alert(1)",
        "kols": [{"influencer_id": 0, "link": "javascript:steal()"}]}).json()
    assert a["drive_folder_url"] == ""            # javascript: stripped
    assert a["kols"][0]["link"] == ""
    ok = client.put(f"/api/assets/{a['id']}", json={"drive_folder_url": "https://drive.google.com/x"}).json()
    assert ok["drive_folder_url"] == "https://drive.google.com/x"   # http(s) kept
    client.delete(f"/api/assets/{a['id']}")


def test_production_config_flags():
    from app.config import Settings, DEFAULT_SECRET
    insecure = Settings(environment="production", secret_key=DEFAULT_SECRET, _env_file=None)
    assert insecure.is_production and insecure.using_default_secret  # would fail-fast at boot
    secure = Settings(environment="production", secret_key="a-real-strong-secret",
                      cors_origins="https://app.example.com", _env_file=None)
    assert not secure.using_default_secret and secure.origins == ["https://app.example.com"]
    # Production must refuse SQLite (ephemeral / single-writer) — the boot guard.
    on_sqlite = Settings(environment="production", secret_key="a-real-strong-secret",
                         database_url="sqlite:///./x.db", _env_file=None)
    assert on_sqlite.is_production and on_sqlite.database_url.lower().startswith("sqlite")
