"""Run PragyaPrep on your own computer, with a fake in-memory AWS. Nothing is stored, sent or billed.

From the backend folder:

  PYTHONPATH=. .venv/bin/python scripts/dev_server.py

Then open http://localhost:8000/docs. Everything resets when you stop the server (press Ctrl+C).
To use another port, for example if 8000 is busy:  PORT=8001 PYTHONPATH=. .venv/bin/python scripts/dev_server.py
It starts with a demo institute, a suspended institute, a platform admin and demo students in each status,
so there is something to try straight away. Login codes are printed here, in place of real emails.
"""
import os

import uvicorn
from moto import mock_aws

from app import courses, tenants
from app.repo import now_iso
from app.config import Settings
from app.main import create_app

# Dummy credentials, so the fake AWS never looks for real ones.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")

PORT = int(os.environ.get("PORT", "8000"))
DEMO_TENANT = "demo"
DEMO_ADMIN_EMAIL = "demo-admin@example.com"
PLATFORM_ADMIN_EMAIL = "owner@example.com"
SUSPENDED_TENANT = "closed"

# People at the demo institute, one for each thing a person can be told when they try to log in.
DEMO_PEOPLE = [
    ("student@example.com", "approved", "Asha"),
    ("pending@example.com", "pending", "Priya"),
    ("pending2@example.com", "pending", "Pooja"),
    ("rejected@example.com", "rejected", "Ravi"),
    ("suspended@example.com", "suspended", "Sunil"),
]

# The courses at the demo institute, which fill the registration dropdown.
DEMO_COURSES = [("CLAT", 10000), ("IPMAT", 10000), ("CAT", 10000)]


def main() -> None:
    with mock_aws():
        settings = Settings(
            _env_file=None,
            table_name="local",
            bucket_name="local-content",
            create_resources=True,
            secret_key="local-dev-secret-key-that-is-long-enough-for-hmac",
        )
        app = create_app(settings)

        tenants.create_tenant(app.state.repo, DEMO_TENANT, "Demo Institute", DEMO_ADMIN_EMAIL, "Demo Admin")
        tenants.ensure_platform_admin(app.state.repo, PLATFORM_ADMIN_EMAIL, "Platform Owner")
        tenants.create_tenant(app.state.repo, SUSPENDED_TENANT, "Closed Institute", "closed-admin@example.com", "Closed Admin")
        tenants.set_tenant_status(app.state.repo, SUSPENDED_TENANT, "suspended")
        demo = app.state.repo.scoped(DEMO_TENANT)
        demo_courses = [courses.create_course(demo, name, fee) for name, fee in DEMO_COURSES]
        for email, status, first_name in DEMO_PEOPLE:
            demo.create_member(
                {
                    "email": email, "role": "student", "status": status,
                    "first_name": first_name, "last_name": "Demo", "birth_date": "2005-03-14", "gender": "female",
                    "mobile": "9876543210", "whatsapp": "9876543210", "address": "12 MG Road, Indirapuram",
                    "city": "Ghaziabad", "pin_code": "201014",
                    "course_id": demo_courses[0]["id"], "course_name": demo_courses[0]["name"],
                    "created_at": now_iso(),
                }
            )

        print()
        print("PragyaPrep local sandbox (fake AWS, resets on exit)")
        print(f"  API docs:        http://localhost:{PORT}/docs")
        print(f"  Demo institute:  X-Tenant: {DEMO_TENANT}  (admin: {DEMO_ADMIN_EMAIL})")
        print(f"  Platform admin:  X-Tenant: platform  (email: {PLATFORM_ADMIN_EMAIL})")
        print(f"  Suspended:       X-Tenant: {SUSPENDED_TENANT}  (an institute that is switched off)")
        print("  Demo students at 'demo': " + ", ".join(f"{email} ({status})" for email, status, _ in DEMO_PEOPLE))
        print("  Demo courses at 'demo':  " + ", ".join(name for name, _ in DEMO_COURSES))
        print("  Login codes are printed in this window, where an email would normally arrive.")
        print()
        uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
