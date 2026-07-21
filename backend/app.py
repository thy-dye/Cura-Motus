import sys 
import os 
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from database import account_bp
from temp import core_bp
from services.exercise_video import exercise_video_bp
from services.gemini_plan import gemini_plan_bp
from services.openai_plan import openai_plan_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(account_bp, url_prefix="/backend")
app.register_blueprint(core_bp, url_prefix="/backend")
app.register_blueprint(exercise_video_bp, url_prefix="/backend")
app.register_blueprint(gemini_plan_bp, url_prefix="/backend")
app.register_blueprint(openai_plan_bp, url_prefix="/backend")

if __name__ == "__main__":
    app.run(debug=True)
