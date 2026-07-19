import os
import requests
from flask import Blueprint, jsonify

from dotenv import load_dotenv
load_dotenv()

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY")
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"

EXERCISE_QUERIES = {
    "squat": "bodyweight squat proper form tutorial",
    "lunge": "standing lunge proper form tutorial",
    "shoulder-raise": "shoulder raise proper form tutorial",
}

_cache: dict[str, dict] = {}

exercise_video_bp = Blueprint("exercise_video", __name__)

def fetch_exercise_video(exercise_id: str) -> dict:
    '''Look up (w/ caching) a demo video for an exercise'''
    if exercise_id in _cache:
        return _cache[exercise_id]

    query = EXERCISE_QUERIES.get(exercise_id)
    if query is None:
        raise ValueError(f"Unknown exercise_idL {exercise_id!r}")

    if not YOUTUBE_API_KEY:
        raise ValueError("Missing YOUTUBE_API_KEY environment variable")    

    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "videoEmbeddable": "true",
        "safeSearch": "strict",
        "maxResults": 1,
        "key": YOUTUBE_API_KEY,
    }

    response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=10)
    response.raise_for_status()
    items = response.json().get("items", [])
    if not items:
        raise LookupError(f"No Youtube results for query: {query!r}")

    top = items[0]
    video_id = top["id"]["videoId"]
    title = top["snippet"]["title"]

    result = {
        "exercise_id": exercise_id,
        "query": query,
        "video_id": video_id,
        "embed_url": f"https://www.youtube.com/embed/{video_id}",
        "watch_url": f"https://www.youtube.com/watch?v={video_id}",
        "title": title,
    }
    _cache[exercise_id] = result
    return result

@exercise_video_bp.route("/api/exercise-video/<exercise_id>", methods=["GET"])
def get_exercise_video(exercise_id):
    if exercise_id not in EXERCISE_QUERIES:
        return jsonify({
            "error": "unknown_exercise",
            "valid_exercise_ids": sorted(EXERCISE_QUERIES.keys()),
        }), 400
    try:
        result = fetch_exercise_video(exercise_id)
    except (requests.RequestException, LookupError, RuntimeError) as e:
        return jsonify({"error": "youtube_lookup_feiled", "detail":str(e)}), 502

    return jsonify(result), 200

def warm_cache():
    '''
    Pre-fetch and cache all exercise videos in one shot
    Call this once at app startup so every video is already cached
    '''
    for exercise_id in EXERCISE_QUERIES:
        try:
            fetch_exercise_video(exercise_id)
            print(f"[ok] {exercise_id} -> {_cache[exercise_id]['video_id']}")
        except Exception as e:
            print(f"[FAIL] {exercise_id}: {e}")

if __name__ == "__main__":
    warm_cache()