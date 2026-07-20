import json
import os
import hashlib
import random
import time
import re 
from flask import Blueprint, jsonify, request
from dotenv import load_dotenv
from google import genai

load_dotenv()

LOCKED_EXERCISES = [
    "squat",
    "lunge",
    "shoulder-raise",
]

GEMINI_MODEL = "gemini-3.5-flash"

MAX_RETRIES = 3
BASE_DELAY_SECONDS = 2
MAX_WAIT_SECONDS = 60
_RETRY_DELAY_PATTERN = re.compile(r"retry in ([\d.]+)\s*s", re.IGNORECASE)

_client = None

_plan_cache: dict[str, dict] = {}

def get_client(): 
    '''lazily create the Gemini client so import doesn't fall if the key isn't set'''
    global _client
    if _client is None:
        if not os.environ.get("GEMINI_API_KEY"):
            raise RuntimeError("Missing GEMINI_API_KEY environment variable")
        _client = genai.Client()
    return _client

gemini_plan_bp = Blueprint("gemini_plan", __name__)

def build_prompt(sports, past_injuries, current_issue, details):
    exercises_list = ", ".join(LOCKED_EXERCISES)
    return f'''generating a short home exercise plan for a physical therapy support app called PT Vision.This is a SUPPLEMENT to professional
care, not a replacement, and not a diagnostic tool.
 
User info:
- Sport(s): {sports}
- Past injuries: {past_injuries}
- Current issue: {current_issue}
- Additional details: {details}
 
You may ONLY select exercises from this fixed list (the app can only track
these): {exercises_list}
 
Return ONLY valid JSON, no markdown, no commentary, in exactly this shape:
{{
  "plan": [
    {{"exercise_id": "one of the locked exercise ids", "sets": 3, "reps": 10, "note": "short reason this helps"}}
  ],
  "disclaimer": "short reminder this is not medical advice and does not replace a physical therapist"
}}
'''

def _cache_key(sports, past_injuries, current_issue, details):
    raw = json.dumps({
        "sports": sports,
        "past_injuries": past_injuries,
        "current_issue": current_issue,
        "details": details,
    }, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()

def _is_retryable(error: Exception):
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    if status in (429, 500, 502, 503, 504):
        return True
    text = str(error)
    return any(marker in text for marker in(
        "429", "500", "502", "503", 
        "RateLimitError", "InternalServerError", "high demand",
        "too_many_requests",
    ))

def _extract_suggested_delay(error:Exception):
    match = _RETRY_DELAY_PATTERN.search(str(error))
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None

def _call_gemini_with_retry(client, prompt):
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return client. interactions.create(
                model=GEMINI_MODEL,
                input=prompt,
            )
        except Exception as e:
            last_error = e
            if attempt == MAX_RETRIES or not _is_retryable(e):
                raise
            suggested_delay = _extract_suggested_delay(e)
            if suggested_delay is not None:
                delay = min(suggested_delay + 1, MAX_WAIT_SECONDS)
                source = "server-suggested"
            else:
                delay = min(
                    BASE_DELAY_SECONDS * (2 ** (attempt - 1)) + random.uniform(0, 1),
                    MAX_WAIT_SECONDS,
                )
                source = "exponential backoff"

            print(
                f"[retry] Gemini call failed ({e.__class__.__name__}), "
                f"retrying in {delay:.1f}s via {source} (attempt {attempt}/{MAX_RETRIES})"
            )
            time.sleep(delay)
    raise last_error

def generate_plan(sports, past_injuries, current_issue, details):
    cache_key = _cache_key(sports, past_injuries, current_issue, details)
    if cache_key in _plan_cache:
        return _plan_cache[cache_key]

    client = get_client()
    prompt = build_prompt(sports, past_injuries, current_issue, details)
    interaction = _call_gemini_with_retry(client, prompt)

    raw_text = interaction.output_text.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:].strip()

    plan = json.loads(raw_text)

    plan["plan"] = [
        step for step in plan.get("plan", [])
        if step.get("exercise_id") in LOCKED_EXERCISES
    ]

    _plan_cache[cache_key] = plan
    return plan

@gemini_plan_bp.route("/api/generate-plan", methods=["POST"])
def generate_plan_route():
    body = request.get_json(silent=True) or {}

    sports = body.get("sports", [])
    past_injuries = body.get("past_injuries", [])
    current_issue = body.get("current_issue", "")
    details = body.get("details", "")

    if not current_issue:
        return jsonify({
            "error": "missing_field",
            "detail": "currentIssue is required"
        }), 400

    try:
        plan = generate_plan(sports, past_injuries, current_issue, details)
    except RuntimeError as e:
        return jsonify({"error": "gemini_not_configured", "detail": str(e)}), 502
    except json.JSONDecodeError as e:
        return jsonify({"error": "gemini_bad_response", "detail": str(e)}), 502
    except Exception as e:
        return jsonify({"error": "gemini_lookup_failed", "detail": str(e)}), 502

    return jsonify(plan), 200

if __name__ == "__main__":
    test_plan = generate_plan(
        sports=["basketball"],
        past_injuries=["ACL sprain, 2023"],
        current_issue="injury",
        details="PT gave me squates and lunges to rebuild knee strength"
    )
    print(json.dumps(test_plan, indent=2))
