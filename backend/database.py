import os
from flask import Flask, request, jsonify
from supabase import create_client, Client
from werkzeug.security import generate_password_hash, check_password_hash
from postgrest.exceptions import APIError
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

supabase: Client = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_KEY"))
'''For all getter functions just pass the ID'''


# ---------------- TABLE 1 ---------------- 

'''
Account Table functions
To create an account pass the following in the following format
'''
@app.route('/account/create', methods=['POST'])
def create_account():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"Error": "Request body must be JSON"}), 400

    first_name = data.get('first_name')
    last_name  = data.get('last_name')
    password   = data.get('password')
    email      = data.get('email')

    if None in (first_name, last_name, password, email):
        return jsonify({"Error": "Not enough parameters"}), 400

    hashed_password = generate_password_hash(password)
    try:
        response = _get_info_with_email(email)
        if not response.data:
            response = (
                supabase.table("USER_PROFILES")
                .insert({"FirstName": first_name ,
                            "LastName": last_name ,
                            "Password": hashed_password,
                            "Email": email ,
                            })
                .execute()
            )
            return jsonify({"id": response.data[0]['id']}), 201
        
        return jsonify({"Error": "Account already associated with Email"}), 401

    except APIError as e:
        return _return_error_get(e)

#i doubt anyone is gonna use this if you do lmk so i can change this to post as it should be
@app.route('/account/delete')
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

@app.route('/account/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"Error": "Request body must be JSON"}), 400
    email = data.get('email')
    password = data.get('password')
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        if check_password_hash(response.data[0]["Password"], password):
            return response.data, 200
        return jsonify({"Error": "Invalid Password"}), 401
    except APIError as e:
        return _return_error_get(e)

'''
getter functions for Account Tables
for all except Get_ID you should pass in the UserID 
otherwise pass in the Email
'''
@app.route('/account/get_account')
def get_account():
    email = request.args.get('email', default=None)
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        return response.data, 200
    except APIError as e:
        return _return_error_get(e)

@app.route('/account/get_id')
def get_ID():
    email = request.args.get('email', default=None)
    try:
        response = _get_info_with_email(email)
        if not response.data:
            return jsonify({"Error": "No account found with that email"}), 404
        return jsonify({"id": response.data[0]['id']}), 201
    except APIError as e:
        return _return_error_get(e)
    
@app.route('/account/get_name')
def get_name():
    id = request.args.get('id', default=None, type=int)
    try:
        response = _get_info_with_id(id)
        if not response.data:
            return jsonify({"Error": "No account found with that id"}), 404
        return response.data[0]['FirstName'] + ' ' + response.data[0]['LastName'], 200
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
@app.route('/activities/put_sports', methods=['POST'])
def put_sports_played():
        raise NotImplementedError("not implemented yet")

@app.route('/activities/put_exercises_ids', methods=['POST'])
def put_exercises():
        raise NotImplementedError("not implemented yet")

@app.route('/activities/delete_user')
def delete_user_data():
        raise NotImplementedError("not implemented yet")

@app.route('/activities/delete_sports')
def delete_sports_played():
        raise NotImplementedError("not implemented yet")

@app.route('/activities/delete_exercises')
def delete_exercises():
        raise NotImplementedError("not implemented yet")

'''getter functions'''
@app.route('/activities/get_user')
def get_user_data():
    raise NotImplementedError("not implemented yet")

# ---------------- TABLE 3 ---------------- 
'''
exercise data and ids
'''
@app.route('/exercise/add_exercise', methods=['POST'])
def add_exercise():
    raise NotImplementedError('not implemented yet')

@app.route('/exercise/remove_exercise', methods=['POST'])
def remove_exercise():
    raise NotImplementedError('not implemented yet')

@app.route('/exercise/get_exercise')
def get_exercise():
    raise NotImplementedError('not implemented yet')


# ---------------- TABLE 4 ---------------- 

'''
Completion of exercises table
'''
@app.route('/completion/put')
def put_user_completed_exercise():
        raise NotImplementedError("not implemented yet")

@app.route('/completion/delete_user_exercises')
def delete_user_completed_exercises():
        raise NotImplementedError("not implemented yet")

'''getter functions'''
@app.route('/completion/get_recent_user_exercise')
def get_recent_user_completed_exercise():
        raise NotImplementedError("not implemented yet")

@app.route('/completion/get_user_exercises')
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

if __name__ == '__main__':
    app.run(debug=True)