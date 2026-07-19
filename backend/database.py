import os
from flask import Blueprint, request, jsonify
from supabase import create_client, Client
from postgrest.exceptions import APIError
from dotenv import load_dotenv

load_dotenv()

account_bp = Blueprint("account", __name__)

supabase: Client = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))
'''For all getter functions just pass the ID'''


# ---------------- TABLE 1 ---------------- 

'''
Account Table functions
To create an account pass the following in the following format
/account/create?username=username&first_name=first_name&last_name=last_name&password=password&email=email
/account/delete?id=int
/account/login?username=username&password=password
/account/get_account?username=username
'''
@account_bp.route('/account/create')
def create_account():
    first_name = request.args.get('first_name', default=None)
    last_name  = request.args.get('last_name', default=None)
    password   = request.args.get('password', default=None)
    email      = request.args.get('email', default=None)
    if None in (first_name, last_name, password, email):
        raise ValueError("Not enough parameters")
    else:
        try:
            response = (
                supabase.table("USER_PROFILES")
                .insert({"FirstName": first_name ,
                            "LastName": last_name ,
                            "Password": password ,
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
@account_bp.route('/account/login')
def login():
    email = request.args.get('email', default=None)
    password = request.args.get('password', default=None)
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        if response.data[0]["Password"] == password:
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
'''
@account_bp.route('/activities/put_sports')
def put_sports_played():
        raise NotImplementedError("not implemented yet")

@account_bp.route('/activities/put_exercises')
def put_exercises():
        raise NotImplementedError("not implemented yet")

@account_bp.route('/activities/delete_user')
def delete_user_data():
        raise NotImplementedError("not implemented yet")

@account_bp.route('/activities/delete_sports')
def delete_sports_played():
        raise NotImplementedError("not implemented yet")

@account_bp.route('/activities/delete_exercises')
def delete_exercises():
        raise NotImplementedError("not implemented yet")

'''getter functions'''
@account_bp.route('/activities/get_user')
def get_user_data():
    raise NotImplementedError("not implemented yet")



# ---------------- TABLE 3 ---------------- 

'''
Completion of exercises table
'''
@account_bp.route('/completion/put')
def put_user_completed_exercise():
        raise NotImplementedError("not implemented yet")

@account_bp.route('/completion/delete_user_exercises')
def delete_user_completed_exercises():
        raise NotImplementedError("not implemented yet")

'''getter functions'''
@account_bp.route('/completion/get_recent_user_exercise')
def get_recent_user_completed_exercise():
        raise NotImplementedError("not implemented yet")

@account_bp.route('/completion/get_user_exercises')
def get_user_completed_exercises():
    response = (
           supabase.table("")
           .select
    )

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