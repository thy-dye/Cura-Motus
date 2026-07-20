import time
import requests
from flask import Blueprint, jsonify

from services.exercise_api import(
    get_all_exercises,
    get_exercises_by_body_part,
)

from dotenv import load_dotenv
load_dotenv()

core_bp = Blueprint("core", __name__)

@core_bp.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "message": "Cura-Motus backend is running"
    })

@core_bp.route("/api/exercises", methods=["GET"])
def exercises():
    try:
        exercise_results = get_all_exercises()

        return jsonify({
            "count": len(exercise_results),
            "exercises": exercise_results,
        })

    except requests.RequestException as error:
        return jsonify({
            "error": "Could not retrieve exercise.",
            "details" : str(error),
        }), 502

@core_bp.route(
    "/api/exercises/body-part/<body_part>", methods=["GET"]
)
def exercises_by_body_part(body_part):
    try:
        exercise_results = get_exercises_by_body_part(body_part)

        return jsonify({
            "bodyPart": body_part,
            "count": len(exercise_results),
            "exercises": exercise_results,
        })
    except requests.RequestException as error:
        return jsonify({
            "error": "Could not retrieve exercise.",
            "details" : str(error),
        }), 502

@core_bp.route('/backend/temp')
def get_current_time():
    return {'time': time.time()}
