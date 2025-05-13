// src/app.ts

// Interfaces
interface Task {
  id: number;
  title: string;
  completed: boolean;
}

interface User {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  auth_provider: string;
}

// Auth state management
class AuthManager {
  private static instance: AuthManager;
  private _currentUser: User | null = null;
  
  private constructor() {}
  
  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }
  
  public get currentUser(): User | null {
    return this._currentUser;
  }
  
  public set currentUser(user: User | null) {
    this._currentUser = user;
    this.updateUI();
  }
  
  public async checkAuthStatus(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/user');
      if (response.ok) {
        this.currentUser = await response.json();
        return true;
      } else {
        this.currentUser = null;
        return false;
      }
    } catch (error) {
      console.error('Auth status check error:', error);
      this.currentUser = null;
      return false;
    }
  }
  
  public async login(email: string, password: string): Promise<void> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      if (response.ok) {
        this.currentUser = await response.json();
        return;
      } 
      
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
      
    } catch (error) {
      throw error;
    }
  }
  
  public async register(email: string, password: string): Promise<void> {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      if (response.ok) {
        this.currentUser = await response.json();
        return;
      }
      
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
      
    } catch (error) {
      throw error;
    }
  }
  
  public async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      this.currentUser = null;
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  
  public async updateProfile(firstName: string, lastName: string): Promise<void> {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName
        })
      });
      
      if (response.ok) {
        this.currentUser = await response.json();
        return;
      }
      
      const error = await response.json();
      throw new Error(error.error || 'Profile update failed');
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Initiates the Google login process by fetching the authentication URL
   * from the server and redirecting the user to Google's authentication page.
   * 
   * This function is triggered when the user clicks the "Google login" button
   * in the UI. The event listener for this button is set up in the `UIManager`
   * class within the `setupEventListeners` method.
   */
  public initiateGoogleLogin(): void {
    // Clear any existing error messages
    const loginError = document.getElementById('login-error') as HTMLDivElement;
    loginError.textContent = '';
    
    fetch('/api/auth/google')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to start Google authentication');
        }
        return response.json();
      })
      .then(data => {
        if (data.auth_url) {
          // Store timestamp for validation when we return
          localStorage.setItem('google_auth_started', Date.now().toString());
          // Navigate to Google's auth page
          window.location.href = data.auth_url;
        } else {
          throw new Error('No authentication URL received');
        }
      })
      .catch(error => {
        console.error('Google login error:', error);
        loginError.textContent = 'Failed to start Google authentication';
      });
  }
  
  private updateUI(): void {
    const authContainer = document.getElementById('auth-container') as HTMLDivElement;
    const mainContainer = document.getElementById('main-container') as HTMLDivElement;
    const appTitle = document.getElementById('app-title') as HTMLHeadingElement;
    const userName = document.getElementById('user-name') as HTMLSpanElement;
    const userEmail = document.getElementById('user-email') as HTMLSpanElement;
    const firstNameInput = document.getElementById('first-name') as HTMLInputElement;
    const lastNameInput = document.getElementById('last-name') as HTMLInputElement;
    
    if (this._currentUser) {
      // User is logged in
      authContainer.classList.add('hidden');
      mainContainer.classList.remove('hidden');
      
      // Update user display name in title
      const displayName = this._currentUser.first_name 
        ? `${this._currentUser.first_name}'s Tasks` 
        : "My Tasks";
      appTitle.textContent = displayName;
      
      // Update profile dropdown
      userName.textContent = this._currentUser.first_name && this._currentUser.last_name
        ? `${this._currentUser.first_name} ${this._currentUser.last_name}`
        : 'User';
      userEmail.textContent = this._currentUser.email;
      
      // Pre-fill profile form
      firstNameInput.value = this._currentUser.first_name || '';
      lastNameInput.value = this._currentUser.last_name || '';
      
      // Fetch tasks for the current user
      taskManager.fetchTasks();
      
    } else {
      // No user logged in
      mainContainer.classList.add('hidden');
      authContainer.classList.remove('hidden');
    }
  }
}

// Task management
class TaskManager {
  private tasks: Task[] = [];
  private taskList: HTMLUListElement;
  
  constructor() {
    this.taskList = document.getElementById('task-list') as HTMLUListElement;
  }
  
  public async fetchTasks(): Promise<void> {
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        this.tasks = await response.json();
        this.renderTasks();
      } else {
        console.error('Failed to fetch tasks');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  public async addTask(title: string): Promise<void> {
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
        this.tasks.push(newTask);
        this.renderTasks();
      } else {
        console.error('Failed to add task');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  public async toggleTaskCompletion(taskId: number, completed: boolean): Promise<void> {
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
        this.tasks = this.tasks.map(task => 
          task.id === taskId ? {...task, completed: updatedTask.completed} : task
        );
      } else {
        console.error('Failed to update task');
        this.renderTasks(); // Revert UI if update failed
      }
    } catch (error) {
      console.error('Error:', error);
      this.renderTasks(); // Revert UI if update failed
    }
  }
  
  public async deleteTask(taskId: number): Promise<void> {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.tasks = this.tasks.filter(task => task.id !== taskId);
        this.renderTasks();
      } else {
        console.error('Failed to delete task');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
  
  private renderTasks(): void {
    this.taskList.innerHTML = '';
    
    this.tasks.forEach(task => {
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
      this.taskList.appendChild(li);
    });
  }
}

// UI Manager for handling UI interactions
class UIManager {
  private authManager: AuthManager;
  private taskManager: TaskManager;
  private profileDropdown: HTMLDivElement;
  private profileModal: HTMLDivElement;
  private overlay: HTMLDivElement;
  
  constructor(authManager: AuthManager, taskManager: TaskManager) {
    this.authManager = authManager;
    this.taskManager = taskManager;
    this.profileDropdown = document.getElementById('profile-dropdown') as HTMLDivElement;
    this.profileModal = document.getElementById('profile-modal') as HTMLDivElement;
    this.overlay = document.getElementById('overlay') as HTMLDivElement;
    
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    // Auth tabs switching
    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = (tab as HTMLElement).dataset.tab;
        
        // Toggle active tab
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Toggle form visibility
        document.querySelectorAll('.auth-form').forEach(form => {
          form.classList.remove('active');
        });
        
        document.getElementById(`${tabId}-form`)?.classList.add('active');
      });
    });
    
    // Login form
    const loginForm = document.getElementById('login-button') as HTMLButtonElement;
    loginForm.addEventListener('click', async () => {
      const emailInput = document.getElementById('login-email') as HTMLInputElement;
      const passwordInput = document.getElementById('login-password') as HTMLInputElement;
      const errorElement = document.getElementById('login-error') as HTMLDivElement;
      
      try {
        await this.authManager.login(emailInput.value, passwordInput.value);
        errorElement.textContent = '';
        passwordInput.value = '';
      } catch (error) {
        errorElement.textContent = error instanceof Error ? error.message : 'Login failed';
      }
    });
    
    // Register form
    const registerForm = document.getElementById('register-button') as HTMLButtonElement;
    registerForm.addEventListener('click', async () => {
      const emailInput = document.getElementById('register-email') as HTMLInputElement;
      const passwordInput = document.getElementById('register-password') as HTMLInputElement;
      const confirmInput = document.getElementById('register-confirm') as HTMLInputElement;
      const errorElement = document.getElementById('register-error') as HTMLDivElement;
      
      if (passwordInput.value !== confirmInput.value) {
        errorElement.textContent = 'Passwords do not match';
        return;
      }
      
      try {
        await this.authManager.register(emailInput.value, passwordInput.value);
        errorElement.textContent = '';
        passwordInput.value = '';
        confirmInput.value = '';
      } catch (error) {
        errorElement.textContent = error instanceof Error ? error.message : 'Registration failed';
      }
    });
    
    // Google login
    const googleButton = document.getElementById('google-login') as HTMLButtonElement;
    googleButton.addEventListener('click', () => {
      this.authManager.initiateGoogleLogin();
    });
    
    // Profile button
    const profileButton = document.getElementById('profile-button') as HTMLButtonElement;
    profileButton.addEventListener('click', () => {
      this.profileDropdown.classList.toggle('hidden');
    });
    
    // Close profile dropdown when clicking outside
    document.addEventListener('click', (event) => {
      if (!profileButton.contains(event.target as Node) && 
          !this.profileDropdown.contains(event.target as Node)) {
        this.profileDropdown.classList.add('hidden');
      }
    });
    
    // Logout button
    const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
    logoutButton.addEventListener('click', async () => {
      await this.authManager.logout();
      this.profileDropdown.classList.add('hidden');
    });
    
    // Edit profile button
    const editProfileButton = document.getElementById('edit-profile-button') as HTMLButtonElement;
    editProfileButton.addEventListener('click', () => {
      this.openProfileModal();
    });
    
    // Close modal button
    const closeModalButton = document.getElementById('close-modal') as HTMLButtonElement;
    closeModalButton.addEventListener('click', () => {
      this.closeProfileModal();
    });
    
    // Overlay click to close modal
    this.overlay.addEventListener('click', () => {
      this.closeProfileModal();
    });
    
    // Save profile changes
    const saveProfileButton = document.getElementById('save-profile') as HTMLButtonElement;
    saveProfileButton.addEventListener('click', async () => {
      const firstNameInput = document.getElementById('first-name') as HTMLInputElement;
      const lastNameInput = document.getElementById('last-name') as HTMLInputElement;
      
      try {
        await this.authManager.updateProfile(firstNameInput.value, lastNameInput.value);
        this.closeProfileModal();
      } catch (error) {
        console.error('Profile update error:', error);
      }
    });
    
    // Task form
    const taskForm = document.getElementById('task-form') as HTMLFormElement;
    const taskInput = document.getElementById('task-input') as HTMLInputElement;
    
    taskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = taskInput.value.trim();
      if (!title) return;
      
      await this.taskManager.addTask(title);
      taskInput.value = '';
    });
    
    // Task list event delegation
    const taskList = document.getElementById('task-list') as HTMLUListElement;
    taskList.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      
      // Handle checkbox clicks
      if (target.tagName === 'INPUT') {
        const checkbox = target as HTMLInputElement;
        if (checkbox.type === 'checkbox') {
          const taskId = parseInt(checkbox.dataset.id || '0');
          const completed = checkbox.checked;
          await this.taskManager.toggleTaskCompletion(taskId, completed);
        }
      }
      
      // Handle delete button clicks
      if (target.classList.contains('delete-btn')) {
        const taskId = parseInt(target.dataset.id || '0');
        await this.taskManager.deleteTask(taskId);
      }
    });
  }
  
  private openProfileModal(): void {
    this.profileModal.classList.remove('hidden');
    this.overlay.classList.remove('hidden');
    this.profileDropdown.classList.add('hidden');
  }
  
  private closeProfileModal(): void {
    this.profileModal.classList.add('hidden');
    this.overlay.classList.add('hidden');
  }
}

function checkForAuthErrors() {
  const urlParams = new URLSearchParams(window.location.hash.substring(1));
  const error = urlParams.get('/login?error');
  
  if (error) {
    const loginError = document.getElementById('login-error');
    if (loginError) {
      switch (error) {
        case 'invalid_state':
          loginError.textContent = 'Authentication error: Session validation failed';
          break;
        case 'token_error':
          loginError.textContent = 'Authentication error: Failed to exchange authorization code';
          break;
        case 'missing_user_info':
          loginError.textContent = 'Authentication error: Could not get user information';
          break;
        case 'oauth_error':
          loginError.textContent = 'Authentication error: OAuth process failed';
          break;
        default:
          loginError.textContent = 'Authentication failed';
      }
      
      // Clean the URL
      window.history.replaceState({}, document.title, '/');
      
      // Show the login form
      const authContainer = document.getElementById('auth-container');
      const mainContainer = document.getElementById('main-container');
      if (authContainer && mainContainer) {
        authContainer.classList.remove('hidden');
        mainContainer.classList.add('hidden');
      }
    }
  }
}


// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  checkForAuthErrors();

  const authManager = AuthManager.getInstance();
  const taskManager = new TaskManager();
  const uiManager = new UIManager(authManager, taskManager);
  
  // Check if user is already logged in
  await authManager.checkAuthStatus();
});

// Make taskManager accessible globally for the AuthManager
const taskManager = new TaskManager();
