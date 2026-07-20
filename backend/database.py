import os
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from supabase import create_client, Client
from postgrest.exceptions import APIError
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

account_bp = Blueprint("account", __name__)

supabase: Client = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))
'''For all getter functions just pass the ID'''


# ---------------- TABLE 1 ---------------- 

'''
Account Table functions
To create an account POST a JSON body to /account/create:
{ "first_name": ..., "last_name": ..., "password": ..., "email": ... }
/account/delete?id=int
To log in POST a JSON body to /account/login: { "email": ..., "password": ... }
/account/get_account?username=username
'''
@account_bp.route('/account/create', methods=["POST"])
def create_account():
    body = request.json or {}
    first_name = body.get('first_name')
    last_name  = body.get('last_name')
    password   = body.get('password')
    email      = body.get('email')
    if None in (first_name, last_name, password, email):
        raise ValueError("Not enough parameters")
    else:
        try:
            response = (
                supabase.table("USER_PROFILES")
                .insert({"FirstName": first_name ,
                            "LastName": last_name ,
                            "Password": generate_password_hash(password) ,
                            "Email": email ,
                            })
                .execute()
            )
            return jsonify({"id": response.data[0]['id']}), 201
        except APIError as e:
            return _return_error_put(e)

@account_bp.route('/account/delete')
def delete_account():
    id = request.args.get('id', default=None, type=int)
    if not id:
        raise ValueError("No Parameters given")
    else:
        try:
            response = (
                supabase.table('USER_PROFILES')
                .delete()
                .eq("id", id)
                .execute()
            )
            return response.data, 201
        except APIError as e:
            return _return_error_delete(e)

#add password change to email being unique
@account_bp.route('/account/login', methods=["POST"])
def login():
    body = request.json or {}
    email = body.get('email')
    password = body.get('password')
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        if check_password_hash(response.data[0]["Password"], password):
            return response.data, 201
        return jsonify({"Error": "Invalid Password"}), 400
    except APIError as e:
        return _return_error_get(e)

'''
getter functions for Account Tables
for all except Get_ID you should pass in the UserID 
otherwise pass in the Username
'''
@account_bp.route('/account/get_account')
def get_account():
    email = request.args.get('email', default=None)
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        return response.data, 201
    except APIError as e:
        return _return_error_get(e)

@account_bp.route('/account/get_id')
def get_ID():
    email = request.args.get('email', default=None)
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        return jsonify({"id": response.data[0]['id']}), 201
    except APIError as e:
        return _return_error_get(e)
    
@account_bp.route('/account/get_name')
def get_name():
    id = request.args.get('id', default=None, type=int)
    try:
        response = _get_info_with_id(id)
        if not response.data:
            return jsonify({"Error": "No account found with that id"}), 404
        return response.data[0]['FirstName'] + ' ' + response.data[0]['LastName'], 201
    except APIError as e:
        return _return_error_get(e)

'''
private functions that gets account using id or username
'''
def _get_info_with_id(id):
    if not id:
        raise ValueError("No Parameters given")
    else:
        response = (
            supabase.table("USER_PROFILES")
            .select("*")
            .filter("id", "in", f'("{id}")')
            .execute()

        )
    return response
def _get_info_with_email(email):
    if not email:
        raise ValueError("No Parameters given")
    else:
        response = (
            supabase.table("USER_PROFILES")
            .select("*")
            .filter("Email", "in", f'("{email}")')
            .execute()
        )
    return response


# ---------------- TABLE 2 ----------------
'''
Account sports + exercises Table
One row per user (ACTIVITIES.UserID is unique) — put_* routes upsert
on UserID, so calling them again just overwrites this user's row.

put_sports: POST JSON { "user_id": int, "sports": [string, ...] }
put_exercises: POST JSON { "user_id": int, "exercises": <jsonb> }
delete_user / delete_sports / delete_exercises / get_user: ?user_id=int
'''
@account_bp.route('/activities/put_sports', methods=["POST"])
def put_sports_played():
    body = request.json or {}
    user_id = body.get('user_id')
    sports = body.get('sports')
    if user_id is None or sports is None:
        raise ValueError("Not enough parameters")
    try:
        response = (
            supabase.table("ACTIVITIES")
            .upsert({"UserID": user_id, "SportsPlayed": sports}, on_conflict="UserID")
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_put(e)

@account_bp.route('/activities/put_exercises', methods=["POST"])
def put_exercises():
    body = request.json or {}
    user_id = body.get('user_id')
    exercises = body.get('exercises')
    if user_id is None or exercises is None:
        raise ValueError("Not enough parameters")
    try:
        response = (
            supabase.table("ACTIVITIES")
            .upsert({"UserID": user_id, "Exercises": exercises}, on_conflict="UserID")
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_put(e)

@account_bp.route('/activities/delete_user')
def delete_user_data():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("ACTIVITIES")
            .delete()
            .eq("UserID", user_id)
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_delete(e)

@account_bp.route('/activities/delete_sports')
def delete_sports_played():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("ACTIVITIES")
            .update({"SportsPlayed": []})
            .eq("UserID", user_id)
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_delete(e)

@account_bp.route('/activities/delete_exercises')
def delete_exercises():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("ACTIVITIES")
            .update({"Exercises": []})
            .eq("UserID", user_id)
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_delete(e)

'''getter functions'''
@account_bp.route('/activities/get_user')
def get_user_data():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("ACTIVITIES")
            .select("*")
            .eq("UserID", user_id)
            .execute()
        )
        if not response.data:
            return jsonify({"Error": "No activities found for that user"}), 404
        return response.data, 201
    except APIError as e:
        return _return_error_get(e)



# ---------------- TABLE 3 ----------------

'''
Completion of exercises table — append-only log, one row per
completed exercise (not one row per user like ACTIVITIES).

put: POST JSON { "user_id": int, "exercise_name": string }
delete_user_exercises / get_recent_user_exercise / get_user_exercises: ?user_id=int
'''
@account_bp.route('/completion/put', methods=["POST"])
def put_user_completed_exercise():
    body = request.json or {}
    user_id = body.get('user_id')
    exercise_name = body.get('exercise_name')
    if user_id is None or not exercise_name:
        raise ValueError("Not enough parameters")
    try:
        response = (
            supabase.table("EXERCISE_COMPLETION")
            .insert({
                "UserID": user_id,
                "ExerciseName": exercise_name,
                "Completion": datetime.now(timezone.utc).isoformat(),
            })
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_put(e)

@account_bp.route('/completion/delete_user_exercises')
def delete_user_completed_exercises():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("EXERCISE_COMPLETION")
            .delete()
            .eq("UserID", user_id)
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_delete(e)

'''getter functions'''
@account_bp.route('/completion/get_recent_user_exercise')
def get_recent_user_completed_exercise():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("EXERCISE_COMPLETION")
            .select("*")
            .eq("UserID", user_id)
            .order("Completion", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return jsonify({"Error": "No completed exercises found for that user"}), 404
        return response.data, 201
    except APIError as e:
        return _return_error_get(e)

@account_bp.route('/completion/get_user_exercises')
def get_user_completed_exercises():
    user_id = request.args.get('user_id', default=None, type=int)
    if not user_id:
        raise ValueError("No Parameters given")
    try:
        response = (
            supabase.table("EXERCISE_COMPLETION")
            .select("*")
            .eq("UserID", user_id)
            .execute()
        )
        return response.data, 201
    except APIError as e:
        return _return_error_get(e)

# you didn't see this function
def _return_error_get(response, message='Get'):
    return jsonify({
        "error": f"Failed to {message}",
        "details": str(response.message)
    }), 500
def _return_error_put(response):
    return _return_error_get(response, 'Put')
def _return_error_delete(response):
    return _return_error_get(response, 'Delete')