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

    updateActivityCounts();
}

function createGoalRow(goal) {
    const row = document.createElement('tr');
    const progressClass = goal.progress >= 80 ? 'text-green-500' :
        goal.progress >= 50 ? 'text-yellow-500' :
            'text-red-500';

    const transaction = db.transaction(['activities'], 'readonly');
    const index = transaction.objectStore('activities').index('goalId');
    const request = index.getAll(goal.id);

    request.onsuccess = () => {
        const activitiesCount = request.result.length;

        row.className = 'hover:bg-gray-50';
        // Add data-goal-id to the row for easier reference
        row.setAttribute('data-goal-id', goal.id);
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${goal.title}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-gray-500">${goal.description}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-500">${new Date(goal.deadline).toLocaleDateString()}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="relative w-full h-2 bg-gray-200 rounded">
                        <div class="absolute top-0 left-0 h-full ${progressClass} bg-current rounded" 
                             style="width: ${goal.progress}%"></div>
                    </div>
                    <span class="ml-2 text-sm ${progressClass}">${goal.progress}%</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center space-x-2">
                    <button onclick="showActivities(${goal.id})" 
                            class="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        View Activities
                    </button>
                    <span class="activity-count inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        ${activitiesCount} ${activitiesCount === 1 ? 'activity' : 'activities'}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button onclick="deleteGoal(${goal.id})" 
                        class="text-red-600 hover:text-red-900">Delete</button>
                <button onclick="updateGoal(${goal.id})" 
                        class="text-blue-600 hover:text-blue-900">Update</button>
            </td>
        `;
    };

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

// Modal state management
let alpineModal;
document.addEventListener('alpine:init', () => {
    Alpine.data('activitiesModal', () => ({
        open: false,
        close() {
            this.open = false;
            closeActivitiesModal();
        }
    }));
});

function showActivities(goalId) {
    currentGoalId = goalId;
    const modal = document.getElementById('activitiesModal');

    // Get Alpine component instance and set open state
    const alpineComponent = Alpine.$data(modal);
    if (alpineComponent) {
        alpineComponent.open = true;
    }
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

    updateRemainingWeight();
}

function addActivity() {
    const title = document.getElementById('activityTitle').value;
    const progress = parseInt(document.getElementById('activityProgress').value);
    const weight = parseFloat(document.getElementById('activityWeight').value);

    if (!title || isNaN(progress) || isNaN(weight)) {
        showError('Please fill in all fields');
        return;
    }

    if (progress < 0 || progress > 100) {
        showError('Progress must be between 0 and 100');
        return;
    }

    if (weight <= 0 || weight > 100) {
        showError('Weight must be between 1 and 100');
        return;
    }

    // Check if total weight would exceed 100%
    checkTotalWeight(weight).then(isValid => {
        if (!isValid) {
            showError('Total weight cannot exceed 100%');
            return;
        }

        const activity = {
            goalId: currentGoalId,
            title,
            progress,
            weight,
            weightedProgress: (progress * weight) / 100
        };

        const transaction = db.transaction(['activities'], 'readwrite');
        transaction.objectStore('activities').add(activity).onsuccess = (e) => {
            clearActivityForm();
            updateGoalProgress(currentGoalId);
            showActivities(currentGoalId);
            updateRemainingWeight();
        };
    });

    updateActivityCounts();
}

async function checkTotalWeight(newWeight) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['activities'], 'readonly');
        const index = transaction.objectStore('activities').index('goalId');
        const request = index.getAll(currentGoalId);

        request.onsuccess = () => {
            const activities = request.result;
            const currentTotal = activities.reduce((sum, activity) => sum + activity.weight, 0);
            resolve(currentTotal + newWeight <= 100);
        };
    });
}

function updateRemainingWeight() {
    const transaction = db.transaction(['activities'], 'readonly');
    const index = transaction.objectStore('activities').index('goalId');
    const request = index.getAll(currentGoalId);

    request.onsuccess = () => {
        const activities = request.result;
        const totalWeight = activities.reduce((sum, activity) => sum + activity.weight, 0);
        const remaining = 100 - totalWeight;
        document.getElementById('remainingWeight').textContent = remaining;
        document.getElementById('activityWeight').max = remaining;

        // Initialize activity progress with 0
        document.getElementById('activityProgress').value = 0;
        // define glanularity of activity weight
        document.getElementById('activityWeight').step = 0.01;

    };
}

// Update the updateGoalProgress function to use weighted calculations
function updateGoalProgress(goalId) {
    const transaction = db.transaction(['activities', 'goals'], 'readwrite');
    const activitiesIndex = transaction.objectStore('activities').index('goalId');
    const request = activitiesIndex.getAll(goalId);

    request.onsuccess = () => {
        const activities = request.result;
        let totalProgress = 0;
        let totalWeight = 0;

        if (activities.length > 0) {
            activities.forEach(activity => {
                totalProgress += (activity.progress * activity.weight);
                totalWeight += activity.weight;
            });

            // Calculate weighted average progress
            totalProgress = totalWeight > 0 ? Math.round(totalProgress / totalWeight) : 0;
        }

        const goalsStore = transaction.objectStore('goals');
        const getGoal = goalsStore.get(goalId);

        getGoal.onsuccess = () => {
            const goal = getGoal.result;
            if (goal) {
                goal.progress = totalProgress;
                goalsStore.put(goal).onsuccess = () => {
                    loadGoals();
                    checkGoalCompletion(goal);
                };
            }
        };
    };

    transaction.onerror = (event) => {
        console.error('Error updating goal progress:', event.target.error);
        showError('There was an error updating the goal progress');
    };
}

function createActivityRow(activity) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-gray-50';
    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm text-gray-900">${formatActivityTitle(activity.title)}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
                <div class="relative w-full h-2 bg-gray-200 rounded">
                    <div class="absolute top-0 left-0 h-full bg-blue-500 rounded" 
                         style="width: ${activity.progress}%"></div>
                </div>
                <span class="ml-2 text-sm text-gray-600">${activity.progress}%</span>
            </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm text-gray-600">${activity.weight}%</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm text-gray-600">${((activity.progress * activity.weight) / 100).toFixed(2)}%</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
            <button onclick="deleteActivity(${activity.id})" 
                    class="text-red-600 hover:text-red-900 transition-colors duration-200">Delete</button>
            <button onclick="updateActivity(${activity.id})" 
                    class="text-blue-600 hover:text-blue-900 transition-colors duration-200">Update</button>
        </td>
    `;
    return row;
}

function showError(message) {
    const errorDiv = document.getElementById('weightError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 3000);
}

// Updated updateGoalProgress function to handle empty activities case
function updateGoalProgress(goalId) {
    const transaction = db.transaction(['activities', 'goals'], 'readwrite');
    const activitiesIndex = transaction.objectStore('activities').index('goalId');
    const request = activitiesIndex.getAll(goalId);

    request.onsuccess = () => {
        const activities = request.result;
        let averageProgress = 0;

        if (activities.length > 0) {
            const totalProgress = activities.reduce((sum, activity) => sum + activity.progress, 0);
            averageProgress = Math.round(totalProgress / activities.length);
        }

        const goalsStore = transaction.objectStore('goals');
        const getGoal = goalsStore.get(goalId);

        getGoal.onsuccess = () => {
            const goal = getGoal.result;
            if (goal) {
                goal.progress = averageProgress;
                goalsStore.put(goal).onsuccess = () => {
                    loadGoals();
                    checkGoalCompletion(goal);
                };
            }
        };
    };

    transaction.onerror = (event) => {
        console.error('Error updating goal progress:', event.target.error);
        alert('There was an error updating the goal progress.');
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
    const modal = document.getElementById('activitiesModal');

    // Get Alpine component instance and set close state
    const alpineComponent = Alpine.$data(modal);
    if (alpineComponent) {
        alpineComponent.open = false;
    }

    // Reset form fields
    document.getElementById('activityTitle').value = '';
    document.getElementById('activityProgress').value = '';

    // Reset any activity update state
    const addButton = document.querySelector('button[onclick="addActivity()"]');
    if (addButton && addButton.textContent !== 'Add Activity') {
        addButton.textContent = 'Add Activity';
        addButton.onclick = addActivity;
    }

    // Clear current goal
    currentGoalId = null;

    // Add hidden class after animation
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

// Add the missing updateGoal function
function updateGoal(goalId) {
    const transaction = db.transaction(['goals'], 'readonly');
    const store = transaction.objectStore('goals');

    store.get(goalId).onsuccess = (event) => {
        const goal = event.target.result;

        // Populate form with current values
        document.getElementById('goalTitle').value = goal.title;
        document.getElementById('goalDescription').value = goal.description;
        document.getElementById('goalDeadline').value = goal.deadline.split('T')[0];

        // Remove old goal and add updated one when form is submitted
        const updateButton = document.querySelector('button[onclick="addGoal()"]');
        updateButton.textContent = 'Update Goal';
        updateButton.onclick = () => {
            const updatedGoal = {
                id: goalId,
                title: document.getElementById('goalTitle').value,
                description: document.getElementById('goalDescription').value,
                deadline: document.getElementById('goalDeadline').value,
                progress: goal.progress,
                createdAt: goal.createdAt
            };

            const updateTransaction = db.transaction(['goals'], 'readwrite');
            const updateStore = updateTransaction.objectStore('goals');

            updateStore.put(updatedGoal).onsuccess = () => {
                clearGoalForm();
                loadGoals();
                // Reset button to original state
                updateButton.textContent = 'Add Goal';
                updateButton.onclick = addGoal;
            };
        };
    };
}


// Update activity management functions
function updateActivity(activityId) {
    const transaction = db.transaction(['activities'], 'readonly');
    const store = transaction.objectStore('activities');

    store.get(activityId).onsuccess = (event) => {
        const activity = event.target.result;
        const originalWeight = activity.weight;

        // Populate form fields with current values
        document.getElementById('activityTitle').value = activity.title;
        document.getElementById('activityProgress').value = activity.progress;
        document.getElementById('activityWeight').value = activity.weight;

        // Update the remaining weight to include the current activity's weight
        const currentRemaining = parseInt(document.getElementById('remainingWeight').textContent);
        document.getElementById('remainingWeight').textContent = currentRemaining + originalWeight;
        document.getElementById('activityWeight').max = currentRemaining + originalWeight;

        const addButton = document.querySelector('button[onclick="addActivity()"]');
        addButton.textContent = 'Update Activity';
        addButton.onclick = () => {
            const newTitle = document.getElementById('activityTitle').value;
            const newProgress = parseInt(document.getElementById('activityProgress').value);
            const newWeight = parseFloat(document.getElementById('activityWeight').value);

            if (!newTitle || isNaN(newProgress) || isNaN(newWeight)) {
                showError('Please fill in all fields');
                return;
            }

            if (newProgress < 0 || newProgress > 100) {
                showError('Progress must be between 0 and 100');
                return;
            }

            if (newWeight <= 0 || newWeight > (currentRemaining + originalWeight)) {
                showError(`Weight must be between 1 and ${currentRemaining + originalWeight}`);
                return;
            }

            const updatedActivity = {
                id: activityId,
                goalId: currentGoalId,
                title: newTitle,
                progress: newProgress,
                weight: newWeight,
                weightedProgress: (newProgress * newWeight) / 100
            };

            const updateTransaction = db.transaction(['activities'], 'readwrite');
            const updateStore = updateTransaction.objectStore('activities');

            updateStore.put(updatedActivity).onsuccess = () => {
                clearActivityForm();
                updateGoalProgress(currentGoalId);
                showActivities(currentGoalId);

                // Reset button state
                addButton.textContent = 'Add Activity';
                addButton.onclick = addActivity;
            };

            updateTransaction.onerror = (event) => {
                console.error('Error updating activity:', event.target.error);
                showError('There was an error updating the activity');
            };
        };
    };

    transaction.onerror = (event) => {
        console.error('Error retrieving activity:', event.target.error);
        showError('There was an error retrieving the activity');
    };
}

// Activity Management Functions
function deleteActivity(activityId) {
    if (!confirm('Are you sure you want to delete this activity?')) {
        return;
    }

    const transaction = db.transaction(['activities'], 'readwrite');
    const store = transaction.objectStore('activities');

    store.delete(activityId).onsuccess = () => {
        // After deletion, update the goal progress and refresh activities list
        updateGoalProgress(currentGoalId);
        showActivities(currentGoalId);
        updateRemainingWeight();
    };

    transaction.oncomplete = () => {
        console.log('Activity deleted successfully');
    };

    transaction.onerror = (event) => {
        console.error('Error deleting activity:', event.target.error);
        alert('There was an error deleting the activity.');
    };

    updateActivityCounts();
}

function clearActivityForm() {
    document.getElementById('activityTitle').value = '';
    document.getElementById('activityProgress').value = '';
    document.getElementById('activityWeight').value = '';
}

// Helper function to update activity counts for all goals
function updateActivityCounts() {
    const transaction = db.transaction(['goals', 'activities'], 'readonly');
    const goalsStore = transaction.objectStore('goals');
    const activitiesIndex = transaction.objectStore('activities').index('goalId');

    goalsStore.getAll().onsuccess = (event) => {
        const goals = event.target.result;
        goals.forEach(goal => {
            const request = activitiesIndex.getAll(goal.id);
            request.onsuccess = () => {
                const count = request.result.length;
                const goalRow = document.querySelector(`tr[data-goal-id="${goal.id}"]`);
                if (goalRow) {
                    const countLabel = goalRow.querySelector('.activity-count');
                    if (countLabel) {
                        countLabel.textContent = `${count} ${count === 1 ? 'activity' : 'activities'}`;
                    }
                }
            };
        });
    };
}

// Helper function to check if a string is a valid URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Helper function to format title as link if needed
function formatActivityTitle(text) {
    // URL regex pattern that matches common URL formats
    const urlPattern = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

    // Replace each URL in the text with a link
    return text.replace(urlPattern, url => {
        // Create link element with appropriate styling
        return `<a href="${url}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">view</a>`;
    });
}


