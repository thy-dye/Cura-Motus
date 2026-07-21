import requests

BASE_URL = "https://oss.exercisedb.dev/api/v1"

# ExerciseDB's fixed body-part taxonomy. Used both to validate/guess a body
# part from free text and to query the API's server-side bodyParts filter.
BODY_PARTS = [
    "back",
    "cardio",
    "chest",
    "lower arms",
    "lower legs",
    "neck",
    "shoulders",
    "upper arms",
    "upper legs",
    "waist",
]

DEFAULT_PAGE_LIMIT = 100
DEFAULT_SHORTLIST_LIMIT = 25


def _fetch_page(params):
    response = requests.get(f"{BASE_URL}/exercises", params=params, timeout=15)
    response.raise_for_status()
    return response.json()


def get_all_exercises():
    '''
    gets every exercise from the API, paging through all results.

    NOTE: the API only returns a page at a time (its `limit` is capped
    server-side well below the ~1500 total exercises), so this walks every
    page using the `offset`/`nextCursor` pagination until hasNextPage is
    false. The previous version only fetched a single page.
    '''
    exercises = []
    params = {"limit": DEFAULT_PAGE_LIMIT}

    while True:
        result = _fetch_page(params)
        exercises.extend(result.get("data", []))

        meta = result.get("meta", {})
        if not meta.get("hasNextPage"):
            break
        params["offset"] = meta.get("nextCursor")

    return exercises


def get_exercises_by_body_part(body_part, limit=DEFAULT_SHORTLIST_LIMIT):
    '''
    retrieves a shortlist of exercises matching a body part, filtered
    server-side by the API's own `bodyParts` query param (faster and more
    correct than pulling everything and filtering client-side).

    `limit` caps how many candidates come back — this is meant to produce a
    short candidate list for the AI to choose from, not the entire catalog
    for that body part.
    '''
    requested_body_part = body_part.strip().lower()

    result = _fetch_page({
        "bodyParts": requested_body_part,
        "limit": limit,
    })

    return result.get("data", [])
