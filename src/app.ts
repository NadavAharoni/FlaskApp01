// src/app.ts
interface Task {
  id: number;
  title: string;
  completed: boolean;
}

document.addEventListener('DOMContentLoaded', () => {
  const taskForm = document.getElementById('task-form') as HTMLFormElement;
  const taskInput = document.getElementById('task-input') as HTMLInputElement;
  const taskList = document.getElementById('task-list') as HTMLUListElement;
  
  let tasks: Task[] = [];
  
  // Fetch all tasks on page load
  fetchTasks();
  
  // Form submission to add new tasks
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = taskInput.value.trim();
    if (!title) return;
    
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });
      
      if (response.ok) {
        const newTask = await response.json();
        tasks.push(newTask);
        renderTasks();
        taskInput.value = '';
      } else {
        console.error('Failed to add task');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });
  
  // Toggle task completion
  taskList.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.type === 'checkbox') {
      const checkbox = target as HTMLInputElement;
      const taskId = parseInt(checkbox.dataset.id || '0');
      const completed = checkbox.checked;
      
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ completed })
        });
        
        if (response.ok) {
          const updatedTask = await response.json();
          tasks = tasks.map(task => 
            task.id === taskId ? {...task, completed: updatedTask.completed} : task
          );
        } else {
          console.error('Failed to update task');
          renderTasks(); // Revert UI if update failed
        }
      } catch (error) {
        console.error('Error:', error);
        renderTasks(); // Revert UI if update failed
      }
    }
    
    // Delete task when delete button is clicked
    if (target.classList.contains('delete-btn')) {
      const taskId = parseInt(target.dataset.id || '0');
      
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          tasks = tasks.filter(task => task.id !== taskId);
          renderTasks();
        } else {
          console.error('Failed to delete task');
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }
  });
  
  // Fetch all tasks from the API
  async function fetchTasks() {
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        tasks = await response.json();
        renderTasks();
      } else {
        console.error('Failed to fetch tasks');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  // Render tasks to the DOM
  function renderTasks() {
    taskList.innerHTML = '';
    
    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.dataset.id = task.id.toString();
      
      const span = document.createElement('span');
      span.textContent = task.title;
      span.className = task.completed ? 'completed' : '';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'delete-btn';
      deleteBtn.dataset.id = task.id.toString();
      
      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(deleteBtn);
      taskList.appendChild(li);
    });
  }
});
