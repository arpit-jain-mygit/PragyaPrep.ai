"""Login routes: user ID + password, sign-up, password change, and Google sign-in."""
from urllib.parse import urlencode
from uuid import uuid4

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import Settings
from app.deps import get_current_user, get_repo, get_settings
from app.repo import ConflictError, Repo, now_iso
from app.schemas import GoogleCompleteIn, LoginIn, PasswordChangeIn, RegisterIn, TokenOut, UserOut
from app.security import create_token, decode_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _token_for(user: dict, settings: Settings) -> TokenOut:
    token = create_token(settings.secret_key, user["id"], "access", settings.access_token_minutes * 60)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/register", status_code=201, response_model=TokenOut)
def register(body: RegisterIn, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings)):
    user = {
        "id": uuid4().hex,
        "login_id": body.login_id.strip(),
        "email": body.email.strip().lower(),
        "full_name": body.full_name.strip(),
        "password_hash": hash_password(body.password),
        "role": "student",
        "created_at": now_iso(),
    }
    try:
        repo.create_user(user)
    except ConflictError:
        raise HTTPException(status_code=409, detail="That ID or email is already registered. Log in instead.")
    return _token_for(user, settings)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings)):
    user = repo.user_by_login(body.login_id.strip())
    # Same message for "no such ID" and "wrong password", so IDs can't be guessed.
    if user is None or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Wrong ID or password")
    return _token_for(user, settings)


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(
    body: PasswordChangeIn,
    user: dict = Depends(get_current_user),
    repo: Repo = Depends(get_repo),
) -> None:
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    repo.update_user(user["id"], password_hash=hash_password(body.new_password))


# ---- Google sign-in (OAuth 2.0 authorization code flow) ----

def _require_google(settings: Settings) -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")


@router.get("/google/start")
def google_start(settings: Settings = Depends(get_settings)):
    _require_google(settings)
    # 'state' protects the callback from forged requests. It is a short-lived signed token.
    state = create_token(settings.secret_key, "google", "oauth_state", 600)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
):
    _require_google(settings)
    try:
        decode_token(settings.secret_key, state, "oauth_state")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Sign-in expired, try again")

    # Swap the one-time code for Google's ID token.
    with httpx.Client(timeout=10) as client:
        response = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Google sign-in failed")

    # Check the ID token really came from Google for our app.
    try:
        info = google_id_token.verify_oauth2_token(
            response.json()["id_token"], google_requests.Request(), settings.google_client_id
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Google sign-in failed")
    if not info.get("email_verified"):
        raise HTTPException(status_code=403, detail="Verify your Google email first")

    google_sub = info["sub"]
    email = info["email"].lower()

    # Returning Google user: sign them in.
    user_id = repo.find_user_id("GOOGLE", google_sub)
    user = repo.get_user(user_id) if user_id else None

    # First Google sign-in: link to an account with the same email if one exists, otherwise
    # send them to choose an ID. The signup token is short-lived and carries only the verified Google details.
    if user is None:
        user = repo.user_by_email(email)
        if user is None:
            signup = create_token(settings.secret_key, google_sub, "google_signup", 900, email=email)
            return RedirectResponse(f"{settings.frontend_url}/complete-profile#signup={signup}")
        repo.link_google(user["id"], google_sub)

    token = create_token(settings.secret_key, user["id"], "access", settings.access_token_minutes * 60)
    # The token goes in the URL fragment, which the browser never sends to a server or logs.
    return RedirectResponse(f"{settings.frontend_url}/login#token={token}")


@router.post("/google/complete", status_code=201, response_model=TokenOut)
def google_complete(
    body: GoogleCompleteIn,
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
):
    try:
        claims = decode_token(settings.secret_key, body.signup_token, "google_signup")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Sign-up expired, sign in with Google again")

    user = {
        "id": uuid4().hex,
        "login_id": body.login_id.strip(),
        "email": claims["email"],
        "google_sub": claims["sub"],
        "full_name": body.full_name.strip(),
        "role": "student",
        "created_at": now_iso(),
    }
    try:
        repo.create_user(user)
    except ConflictError:
        raise HTTPException(status_code=409, detail="That ID is taken, or this Google account is already registered")
    return _token_for(user, settings)
