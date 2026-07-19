import time
import requests
from flask import Flask, jsonify
from flask_cors import CORS

from services.exercise_api import(
    get_all_exercises,
    get_exercises_by_body_part,
)   

app = Flask(__name__)
CORS(app)

from dotenv import load_dotenv
load_dotenv()

from services.exercise_video import exercise_video_bp
app.register_blueprint(exercise_video_bp)

from services.gemini_plan import gemini_plan_bp
app.register_blueprint(gemini_plan_bp)

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "message": "Cura-Motus backend is running"
    })

@app.route("/api/exercises", methods=["GET"])
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

@app.route(
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

@app.route('/backend/temp')
def get_current_time():
    return {'time': time.time()}

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
    )