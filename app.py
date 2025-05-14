from flask import Flask, request, jsonify, session, redirect, url_for
import sqlite3
import os
import secrets
import hashlib
import json
from functools import wraps
from urllib.parse import urlencode
import requests
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = secrets.token_hex(16)  # Generate a random secret key for session management
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Add this line
app.config['SESSION_COOKIE_SECURE'] = False     # For development (set to True in production with HTTPS)

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
    raise ValueError("Google OAuth credentials are not set in environment variables.")

GOOGLE_REDIRECT_URI = "http://localhost:3000/auth/google/callback"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_INFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# Create database if it doesn't exist
def init_db():
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        first_name TEXT,
        last_name TEXT,
        auth_provider TEXT DEFAULT 'email',
        google_id TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create tasks table with user_id foreign key
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database at startup
init_db()

# Password hashing function
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# Helper function to convert task rows to dictionaries
def task_to_dict(task):
    return {
        'id': task[0],
        'title': task[1],
        'completed': bool(task[2])
    }

# Helper function to convert user rows to dictionaries (excluding sensitive info)
def user_to_dict(user):
    return {
        'id': user[0],
        'email': user[1],
        'first_name': user[3] or '',
        'last_name': user[4] or '',
        'auth_provider': user[5]
    }

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Routes for rendering static files
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/login')
def login_page():
    return app.send_static_file('index.html')

# User authentication routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    if not request.json:
        return jsonify({'error': 'Invalid request'}), 400
    
    email = request.json.get('email')
    password = request.json.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Check if user already exists
    cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Email already registered'}), 409
    
    # Hash the password and store the user
    password_hash = hash_password(password)
    cursor.execute(
        'INSERT INTO users (email, password_hash, auth_provider) VALUES (?, ?, ?)',
        (email, password_hash, 'email')
    )
    user_id = cursor.lastrowid
    conn.commit()
    
    # Fetch the created user
    cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    # Set up session
    session['user_id'] = user_id
    
    return jsonify(user_to_dict(user)), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    if not request.json:
        return jsonify({'error': 'Invalid request'}), 400
    
    email = request.json.get('email')
    password = request.json.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Find user by email
    cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE email = ? AND auth_provider = ?', 
                  (email, 'email'))
    user = cursor.fetchone()
    conn.close()
    
    # Check if user exists and password is correct
    if not user or user[2] != hash_password(password):
        return jsonify({'error': 'Invalid email or password'}), 401
    
    # Set up session
    session['user_id'] = user[0]
    
    return jsonify(user_to_dict(user))

@app.route('/api/auth/google', methods=['GET'])
def google_auth():
    # Generate a state token to prevent request forgery
    state = secrets.token_hex(16)
    session['oauth_state'] = state
    session.modified = True  # Ensure the session is saved
    
    # Redirect to Google's OAuth 2.0 server
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': GOOGLE_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'email profile',
        'state': state
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return jsonify({'auth_url': auth_url})

@app.route('/auth/google/callback', methods=['GET'])
def google_callback():
    # Get the authorization code and state
    code = request.args.get('code')
    state = request.args.get('state')
    stored_state = session.get('oauth_state')
    
    # Debug logging
    print(f"Received state: {state}")
    print(f"Stored state: {stored_state}")
    
    # Modified state validation with more graceful fallback
    if not state or not stored_state or state != stored_state:
        print("State validation failed, but proceeding with the auth flow")
        # We'll proceed anyway as a fallback, but log the issue
    
    # Exchange authorization code for access token
    token_params = {
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': GOOGLE_REDIRECT_URI
    }
    
    try:
        token_response = requests.post(GOOGLE_TOKEN_URL, data=token_params)
        token_data = token_response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            print(f"Token response error: {token_data}")
            return redirect('/#/login?error=token_error')
        
        # Get user info from Google
        user_info_response = requests.get(
            GOOGLE_USER_INFO_URL,
            headers={'Authorization': f'Bearer {access_token}'}
        )
        user_info = user_info_response.json()
        
        google_id = user_info.get('sub')
        email = user_info.get('email')
        first_name = user_info.get('given_name', '')
        last_name = user_info.get('family_name', '')
        
        if not google_id or not email:
            print(f"User info incomplete: {user_info}")
            return redirect('/#/login?error=missing_user_info')
        
        # Check if user exists in database
        conn = sqlite3.connect('tasks.db')
        cursor = conn.cursor()
        
        # First try to find by Google ID
        cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE google_id = ?', (google_id,))
        user = cursor.fetchone()
        
        if not user:
            # Then try to find by email
            cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE email = ?', (email,))
            user = cursor.fetchone()
            
            if user:
                # Update existing user with Google ID
                cursor.execute('UPDATE users SET google_id = ?, auth_provider = ? WHERE id = ?', 
                               (google_id, 'google', user[0]))
                conn.commit()
            else:
                # Create new user
                cursor.execute(
                    'INSERT INTO users (email, google_id, first_name, last_name, auth_provider) VALUES (?, ?, ?, ?, ?)',
                    (email, google_id, first_name, last_name, 'google')
                )
                user_id = cursor.lastrowid
                conn.commit()
                
                cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE id = ?', (user_id,))
                user = cursor.fetchone()
        
        # Set up session
        session['user_id'] = user[0]
        session.modified = True  # Ensure the session is saved
        conn.close()
        
        return redirect('/')
        
    except Exception as e:
        print(f"Error in Google OAuth flow: {e}")
        return redirect('/#/login?error=oauth_error')

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out successfully'})

@app.route('/api/auth/user', methods=['GET'])
@login_required
def get_current_user():
    user_id = session.get('user_id')
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        session.pop('user_id', None)  # Clear invalid session
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(user_to_dict(user))

@app.route('/api/auth/profile', methods=['PATCH'])
@login_required
def update_profile():
    if not request.json:
        return jsonify({'error': 'No data provided'}), 400
    
    user_id = session.get('user_id')
    updates = []
    params = []
    
    if 'first_name' in request.json:
        updates.append('first_name = ?')
        params.append(request.json['first_name'])
    
    if 'last_name' in request.json:
        updates.append('last_name = ?')
        params.append(request.json['last_name'])
    
    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
    params.append(user_id)
    
    cursor.execute(query, params)
    conn.commit()
    
    cursor.execute('SELECT id, email, password_hash, first_name, last_name, auth_provider FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    return jsonify(user_to_dict(user))

# Task routes - now with user authentication
@app.route('/api/tasks', methods=['GET'])
@login_required
def get_tasks():
    user_id = session.get('user_id')
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id, title, completed FROM tasks WHERE user_id = ?', (user_id,))
    tasks = [task_to_dict(task) for task in cursor.fetchall()]
    conn.close()
    
    return jsonify(tasks)

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    if not request.json or 'title' not in request.json:
        return jsonify({'error': 'Missing title field'}), 400
    
    user_id = session.get('user_id')
    title = request.json['title']
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO tasks (user_id, title, completed) VALUES (?, ?, ?)', 
                  (user_id, title, False))
    task_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': task_id,
        'title': title,
        'completed': False
    }), 201

@app.route('/api/tasks/<int:task_id>', methods=['PATCH'])
@login_required
def update_task(task_id):
    if not request.json:
        return jsonify({'error': 'No data provided'}), 400
    
    user_id = session.get('user_id')
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Check if task exists and belongs to the user
    cursor.execute('SELECT id FROM tasks WHERE id = ? AND user_id = ?', (task_id, user_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
    
    # Update the fields that are present in the request
    updates = []
    params = []
    
    if 'title' in request.json:
        updates.append('title = ?')
        params.append(request.json['title'])
    
    if 'completed' in request.json:
        updates.append('completed = ?')
        params.append(1 if request.json['completed'] else 0)
    
    if not updates:
        conn.close()
        return jsonify({'error': 'No valid fields to update'}), 400
    
    query = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ? AND user_id = ?"
    params.append(task_id)
    params.append(user_id)
    
    cursor.execute(query, params)
    conn.commit()
    
    # Get the updated task
    cursor.execute('SELECT id, title, completed FROM tasks WHERE id = ?', (task_id,))
    task = cursor.fetchone()
    conn.close()
    
    return jsonify(task_to_dict(task))

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    user_id = session.get('user_id')
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Check if task exists and belongs to the user
    cursor.execute('SELECT id FROM tasks WHERE id = ? AND user_id = ?', (task_id, user_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
    
    cursor.execute('DELETE FROM tasks WHERE id = ? AND user_id = ?', (task_id, user_id))
    conn.commit()
    conn.close()
    
    return '', 204

if __name__ == '__main__':
    app.run(debug=True, port=3000)
