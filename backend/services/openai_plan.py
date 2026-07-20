import json
import os
import hashlib
import random
import time
import re
import difflib
from flask import Blueprint, jsonify, request
from dotenv import load_dotenv
from openai import OpenAI

from services.exercise_api import get_exercises_by_body_part, BODY_PARTS

load_dotenv()

LOCKED_EXERCISES = [
    "squat",
    "lunge",
    "shoulder-raise",
]

# gpt-5.6-luna is the cost-efficient tier — a good fit for this kind of
# short, structured JSON generation. Swap to gpt-5.6-terra or gpt-5.6-sol
# if you want stronger reasoning over the injury/history context.
OPENAI_MODEL = "gpt-5.6-luna"

MAX_RETRIES = 3
BASE_DELAY_SECONDS = 2
MAX_WAIT_SECONDS = 60
_RETRY_DELAY_PATTERN = re.compile(r"retry in ([\d.]+)\s*s", re.IGNORECASE)

_client = None

_plan_cache: dict[str, dict] = {}


def get_client():
    '''lazily create the OpenAI client so import doesn't fail if the key isn't set'''
    global _client
    if _client is None:
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("Missing OPENAI_API_KEY environment variable")
        _client = OpenAI()
    return _client


openai_plan_bp = Blueprint("openai_plan", __name__)


def _is_retryable(error: Exception):
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    if status in (429, 500, 502, 503, 504):
        return True
    text = str(error)
    return any(marker in text for marker in (
        "429", "500", "502", "503",
        "RateLimitError", "InternalServerError", "high demand",
        "too_many_requests",
    ))


def _extract_suggested_delay(error: Exception):
    match = _RETRY_DELAY_PATTERN.search(str(error))
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _call_openai_with_retry(client, prompt, model=OPENAI_MODEL):
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return client.responses.create(
                model=model,
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
                f"[retry] OpenAI call failed ({e.__class__.__name__}), "
                f"retrying in {delay:.1f}s via {source} (attempt {attempt}/{MAX_RETRIES})"
            )
            time.sleep(delay)
    raise last_error


def _clean_json_text(raw_text):
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:].strip()
    return raw_text


# ---------------------------------------------------------------------------
# Stage 1: guess a body part from free text. Shared by AI plan generation
# and (via resolve_exercise below) the PT-prescribed exercise flow.
# ---------------------------------------------------------------------------

def guess_body_part(text):
    '''
    Maps a free-text description (current issue / details, or a
    PT-prescribed exercise name) onto one of ExerciseDB's fixed body-part
    categories, so we can query the real catalog instead of trusting
    whatever the model or user typed.
    Returns None if nothing reasonable matches.
    '''
    if not text or not text.strip():
        return None

    client = get_client()
    body_parts_list = ", ".join(BODY_PARTS)

    prompt = f'''Given this description, pick the ONE body part from this fixed
list that it is most relevant to: {body_parts_list}

Description: {text}

Return ONLY the body part exactly as written in the list, no punctuation,
no commentary. If nothing reasonably matches, return "none".
'''
    response = _call_openai_with_retry(client, prompt)
    guess = response.output_text.strip().strip('"').lower()

    if guess in BODY_PARTS:
        return guess
    return None


# ---------------------------------------------------------------------------
# Resolve free text (an AI suggestion, or a PT-prescribed exercise name) to
# a real ExerciseDB catalog entry, instead of trusting the text as-is.
# Shared logic — usable by both the AI plan flow and the PT-prescribed flow.
# ---------------------------------------------------------------------------

def resolve_exercise(name_or_description, candidates=None):
    '''
    Matches free text to a real ExerciseDB entry.
    Returns the matched catalog entry dict, or None if no good match.
    '''
    if candidates is None:
        body_part = guess_body_part(name_or_description)
        if body_part is None:
            return None
        candidates = get_exercises_by_body_part(body_part)

    if not candidates:
        return None

    names = [c["name"] for c in candidates]
    best_matches = difflib.get_close_matches(
        name_or_description.strip().lower(), names, n=1, cutoff=0.4
    )
    if not best_matches:
        return None

    match_name = best_matches[0]
    return next((c for c in candidates if c["name"] == match_name), None)


def build_prompt(sports, past_injuries, current_issue, details, catalog_candidates):
    exercises_list = ", ".join(LOCKED_EXERCISES)

    if catalog_candidates:
        catalog_lines = "\n".join(
            f'- {c["exerciseId"]}: {c["name"]}' for c in catalog_candidates
        )
        catalog_block = f'''
You may ALSO select from these real catalog exercises if a locked exercise
isn't a good fit (use the id shown, exactly as written):
{catalog_lines}
'''
    else:
        catalog_block = ""

    return f'''generating a short home exercise plan for a physical therapy support app called PT Vision. This is a SUPPLEMENT to professional
care, not a replacement, and not a diagnostic tool.
User info:
- Sport(s): {sports}
- Past injuries: {past_injuries}
- Current issue: {current_issue}
- Additional details: {details}
You may select exercises from this fixed camera-tracked list (the app can
track these live with the camera): {exercises_list}
{catalog_block}
Never invent an exercise id that isn't one of the ids listed above.
Return ONLY valid JSON, no markdown, no commentary, in exactly this shape:
{{
  "plan": [
{{"exercise_id": "an id from one of the lists above", "source": "locked or catalog", "sets": 3, "reps": 10, "note": "short reason this helps"}}
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


def generate_plan(sports, past_injuries, current_issue, details):
    cache_key = _cache_key(sports, past_injuries, current_issue, details)
    if cache_key in _plan_cache:
        return _plan_cache[cache_key]

    client = get_client()

    # Stage 1 + 2: guess a body part, then pull a real shortlist of
    # candidate exercises for it — instead of letting the model invent
    # anything beyond the 3 locked exercises.
    body_part = guess_body_part(f"{current_issue} {details}".strip())
    catalog_candidates = get_exercises_by_body_part(body_part) if body_part else []
    candidates_by_id = {c["exerciseId"]: c for c in catalog_candidates}

    # Stage 3: have the model pick only from the locked list + that real
    # shortlist.
    prompt = build_prompt(sports, past_injuries, current_issue, details, catalog_candidates)
    response = _call_openai_with_retry(client, prompt)

    raw_text = _clean_json_text(response.output_text)
    plan = json.loads(raw_text)

    validated_steps = []
    for step in plan.get("plan", []):
        exercise_id = step.get("exercise_id")
        source = step.get("source")

        if source == "locked" and exercise_id in LOCKED_EXERCISES:
            validated_steps.append(step)
        elif source == "catalog" and exercise_id in candidates_by_id:
            catalog_entry = candidates_by_id[exercise_id]
            validated_steps.append({
                **step,
                "name": catalog_entry.get("name"),
                "gif_url": catalog_entry.get("gifUrl"),
            })
        # Anything else — wrong source, an invented id, or an id that
        # wasn't actually offered — gets silently dropped. Same
        # defense-in-depth idea as the old LOCKED_EXERCISES-only filter,
        # just extended to cover the catalog shortlist too.

    plan["plan"] = validated_steps

    _plan_cache[cache_key] = plan
    return plan


@openai_plan_bp.route("/api/generate-plan", methods=["POST"])
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
        return jsonify({"error": "openai_not_configured", "detail": str(e)}), 502
    except json.JSONDecodeError as e:
        return jsonify({"error": "openai_bad_response", "detail": str(e)}), 502
    except Exception as e:
        return jsonify({"error": "openai_lookup_failed", "detail": str(e)}), 502

    return jsonify(plan), 200


if __name__ == "__main__":
    test_plan = generate_plan(
        sports=["running"],
        past_injuries=["calf strain, 2024"],
        current_issue="calf tightness",
        details="PT wants me doing calf stretchign and strengthening after a strain"
    )
    print(json.dumps(test_plan, indent=2))