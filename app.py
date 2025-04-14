from flask import Flask, request, jsonify
import sqlite3
import os

app = Flask(__name__, static_folder='.', static_url_path='')

# Create database if it doesn't exist
def init_db():
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT 0
    )
    ''')
    conn.commit()
    conn.close()

# Initialize database at startup
init_db()

# Helper function to convert task rows to dictionaries
def task_to_dict(task):
    return {
        'id': task[0],
        'title': task[1],
        'completed': bool(task[2])
    }

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id, title, completed FROM tasks')
    tasks = [task_to_dict(task) for task in cursor.fetchall()]
    conn.close()
    return jsonify(tasks)

@app.route('/api/tasks', methods=['POST'])
def create_task():
    if not request.json or 'title' not in request.json:
        return jsonify({'error': 'Missing title field'}), 400
    
    title = request.json['title']
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO tasks (title, completed) VALUES (?, ?)', (title, False))
    task_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': task_id,
        'title': title,
        'completed': False
    }), 201

@app.route('/api/tasks/<int:task_id>', methods=['PATCH'])
def update_task(task_id):
    if not request.json:
        return jsonify({'error': 'No data provided'}), 400
    
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Check if task exists
    cursor.execute('SELECT id FROM tasks WHERE id = ?', (task_id,))
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
    
    query = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"
    params.append(task_id)
    
    cursor.execute(query, params)
    conn.commit()
    
    # Get the updated task
    cursor.execute('SELECT id, title, completed FROM tasks WHERE id = ?', (task_id,))
    task = cursor.fetchone()
    conn.close()
    
    return jsonify(task_to_dict(task))

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    conn = sqlite3.connect('tasks.db')
    cursor = conn.cursor()
    
    # Check if task exists
    cursor.execute('SELECT id FROM tasks WHERE id = ?', (task_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Task not found'}), 404
    
    cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()
    
    return '', 204

if __name__ == '__main__':
    app.run(debug=True, port=3000)
