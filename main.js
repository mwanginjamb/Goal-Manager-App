// Database initialization
let db;
const request = indexedDB.open('GoalSettingDB', 1);

request.onerror = (event) => {
    console.error('Database error:', event.target.error);
};

request.onupgradeneeded = (event) => {
    db = event.target.result;

    // Create goals object store
    if (!db.objectStoreNames.contains('goals')) {
        const goalsStore = db.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
        goalsStore.createIndex('title', 'title', { unique: false });
        goalsStore.createIndex('deadline', 'deadline', { unique: false });
    }

    // Create activities object store
    if (!db.objectStoreNames.contains('activities')) {
        const activitiesStore = db.createObjectStore('activities', { keyPath: 'id', autoIncrement: true });
        activitiesStore.createIndex('goalId', 'goalId', { unique: false });
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
    loadGoals();
    setupNotifications();
};

// Goal Management
async function addGoal() {
    const title = document.getElementById('goalTitle').value;
    const description = document.getElementById('goalDescription').value;
    const deadline = document.getElementById('goalDeadline').value;

    if (!title || !description || !deadline) {
        alert('Please fill in all fields');
        return;
    }

    const goal = {
        title,
        description,
        deadline,
        progress: 0,
        createdAt: new Date().toISOString()
    };

    const transaction = db.transaction(['goals'], 'readwrite');
    const store = transaction.objectStore('goals');

    store.add(goal).onsuccess = () => {
        clearGoalForm();
        loadGoals();
    };
}

function loadGoals() {
    const transaction = db.transaction(['goals'], 'readonly');
    const store = transaction.objectStore('goals');
    const request = store.getAll();

    request.onsuccess = () => {
        const goals = request.result;
        const tbody = document.getElementById('goalsTableBody');
        tbody.innerHTML = '';

        goals.forEach(goal => {
            const row = createGoalRow(goal);
            tbody.appendChild(row);
        });
    };
}

function createGoalRow(goal) {
    const row = document.createElement('tr');

    const progressClass = goal.progress >= 80 ? 'progress-good' :
        goal.progress >= 50 ? 'progress-warning' :
            'progress-danger';

    row.innerHTML = `
        <td>${goal.title}</td>
        <td>${goal.description}</td>
        <td>${new Date(goal.deadline).toLocaleDateString()}</td>
        <td class="${progressClass}">${goal.progress}%</td>
        <td>
            <button onclick="showActivities(${goal.id})">View Activities</button>
        </td>
        <td>
            <button onclick="deleteGoal(${goal.id})">Delete</button>
            <button onclick="updateGoal(${goal.id})">Update</button>
        </td>
    `;

    return row;
}

function deleteGoal(goalId) {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    const transaction = db.transaction(['goals', 'activities'], 'readwrite');

    // Delete goal
    transaction.objectStore('goals').delete(goalId);

    // Delete associated activities
    const activitiesStore = transaction.objectStore('activities');
    const index = activitiesStore.index('goalId');
    const request = index.getAll(goalId);

    request.onsuccess = () => {
        request.result.forEach(activity => {
            activitiesStore.delete(activity.id);
        });
        loadGoals();
    };
}

// Activity Management
let currentGoalId = null;

function showActivities(goalId) {
    currentGoalId = goalId;
    const modal = document.getElementById('activitiesModal');
    modal.classList.remove('hidden');

    const transaction = db.transaction(['goals', 'activities'], 'readonly');

    // Get goal title
    transaction.objectStore('goals').get(goalId).onsuccess = (event) => {
        const goal = event.target.result;
        document.getElementById('currentGoalTitle').textContent = goal.title;
    };

    // Load activities
    const index = transaction.objectStore('activities').index('goalId');
    const request = index.getAll(goalId);

    request.onsuccess = () => {
        const activities = request.result;
        const tbody = document.getElementById('activitiesTableBody');
        tbody.innerHTML = '';

        activities.forEach(activity => {
            const row = createActivityRow(activity);
            tbody.appendChild(row);
        });
    };
}

function addActivity() {
    const title = document.getElementById('activityTitle').value;
    const progress = parseInt(document.getElementById('activityProgress').value);

    if (!title || isNaN(progress) || progress < 0 || progress > 100) {
        alert('Please enter valid activity details');
        return;
    }

    const activity = {
        goalId: currentGoalId,
        title,
        progress
    };

    const transaction = db.transaction(['activities', 'goals'], 'readwrite');

    transaction.objectStore('activities').add(activity).onsuccess = () => {
        updateGoalProgress(currentGoalId);
        document.getElementById('activityTitle').value = '';
        document.getElementById('activityProgress').value = '';
        showActivities(currentGoalId);
    };
}

function createActivityRow(activity) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${activity.title}</td>
        <td>${activity.progress}%</td>
        <td>
            <button onclick="deleteActivity(${activity.id})">Delete</button>
            <button onclick="updateActivity(${activity.id})">Update</button>
        </td>
    `;
    return row;
}

function updateGoalProgress(goalId) {
    const transaction = db.transaction(['activities', 'goals'], 'readwrite');
    const activitiesIndex = transaction.objectStore('activities').index('goalId');
    const request = activitiesIndex.getAll(goalId);

    request.onsuccess = () => {
        const activities = request.result;
        if (activities.length === 0) return;

        const totalProgress = activities.reduce((sum, activity) => sum + activity.progress, 0);
        const averageProgress = Math.round(totalProgress / activities.length);

        const goalsStore = transaction.objectStore('goals');
        const getGoal = goalsStore.get(goalId);

        getGoal.onsuccess = () => {
            const goal = getGoal.result;
            goal.progress = averageProgress;
            goalsStore.put(goal).onsuccess = () => {
                loadGoals();
                checkGoalCompletion(goal);
            };
        };
    };
}

// Notifications
function setupNotifications() {
    if (!("Notification" in window)) {
        console.log("This browser does not support notifications");
        return;
    }

    Notification.requestPermission();
}

function checkGoalCompletion(goal) {
    if (goal.progress >= 100) {
        notifyUser(`Congratulations! You've completed your goal: ${goal.title}`);
    } else {
        const deadline = new Date(goal.deadline);
        const today = new Date();
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 3 && daysLeft > 0) {
            notifyUser(`Reminder: ${daysLeft} days left to complete your goal: ${goal.title}`);
        }
    }
}

function notifyUser(message) {
    if (Notification.permission === "granted") {
        new Notification("Goal Setting App", { body: message });
    }
}

// Utility functions
function clearGoalForm() {
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalDescription').value = '';
    document.getElementById('goalDeadline').value = '';
}

function closeActivitiesModal() {
    document.getElementById('activitiesModal').classList.add('hidden');
    currentGoalId = null;
}