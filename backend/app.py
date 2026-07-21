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

app.register_blueprint(account_bp)
app.register_blueprint(core_bp)
app.register_blueprint(exercise_video_bp)
app.register_blueprint(gemini_plan_bp)
app.register_blueprint(openai_plan_bp)

if __name__ == "__main__":
    app.run(debug=True)
