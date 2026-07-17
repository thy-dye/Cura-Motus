import requests

BASE_URL = "https://oss.exercisedb.dev/api/v1"

def get_all_exercises():
    '''gets a page of exercises from API'''
    response = requests.get(
        f"{BASE_URL}/exercises",
        timeout=15
    )

    response.raise_for_status()

    result = response.json()

    #API places actual exercise list inside "data"
    return result.get("data", [])

def get_exercises_by_body_part(body_part):
    '''retreives exercises and filter them by body part'''
    exercises = get_all_exercises()
    requested_body_part = body_part.strip().lower()

    matching_exercises = []

    for exercise in exercises:
        body_parts = exercise.get("bodyParts", [])
        normalized_body_parts = [
            str(part).strip().lower()
            for part in body_parts
        ]

        if requested_body_part in normalized_body_parts:
            matching_exercises.append(exercise)

    return matching_exercises